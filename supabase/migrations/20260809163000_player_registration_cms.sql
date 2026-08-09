-- CMS-managed seasonal player registration.
--
-- Registration options and Terms and Conditions remain on the existing
-- club_season_registration_settings row as validated JSONB arrays. This keeps
-- a complete CMS save atomic through the existing PostgREST server client and
-- avoids an exposed privileged mutation function.
--
-- Rollback (review separately; application rollback can safely leave these
-- additive fields in place):
--   DROP TRIGGER IF EXISTS trg_initialise_club_season_registration ON club_seasons;
--   DROP FUNCTION IF EXISTS initialise_club_season_registration_settings();
--   ALTER TABLE club_season_registration_settings
--     DROP COLUMN IF EXISTS terms_sections,
--     DROP COLUMN IF EXISTS terms_title,
--     DROP COLUMN IF EXISTS registration_options,
--     DROP COLUMN IF EXISTS show_in_navigation,
--     DROP COLUMN IF EXISTS intro_text,
--     DROP COLUMN IF EXISTS navigation_label,
--     DROP COLUMN IF EXISTS page_title;

ALTER TABLE club_season_registration_settings
  ADD COLUMN IF NOT EXISTS page_title TEXT NOT NULL DEFAULT 'Player Registration',
  ADD COLUMN IF NOT EXISTS navigation_label TEXT NOT NULL DEFAULT 'Player Registration',
  ADD COLUMN IF NOT EXISTS intro_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS show_in_navigation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS registration_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS terms_title TEXT NOT NULL DEFAULT 'Newcomb and District Cricket Club - Terms and Conditions',
  ADD COLUMN IF NOT EXISTS terms_sections JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'club_season_registration_page_title_check') THEN
    ALTER TABLE club_season_registration_settings
      ADD CONSTRAINT club_season_registration_page_title_check
      CHECK (char_length(btrim(page_title)) BETWEEN 1 AND 160);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'club_season_registration_navigation_label_check') THEN
    ALTER TABLE club_season_registration_settings
      ADD CONSTRAINT club_season_registration_navigation_label_check
      CHECK (char_length(btrim(navigation_label)) BETWEEN 1 AND 120);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'club_season_registration_intro_text_check') THEN
    ALTER TABLE club_season_registration_settings
      ADD CONSTRAINT club_season_registration_intro_text_check
      CHECK (char_length(intro_text) <= 1000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'club_season_registration_options_json_check') THEN
    ALTER TABLE club_season_registration_settings
      ADD CONSTRAINT club_season_registration_options_json_check
      CHECK (
        jsonb_typeof(registration_options) = 'array'
        AND jsonb_array_length(registration_options) <= 12
        AND octet_length(registration_options::text) <= 20000
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'club_season_registration_terms_json_check') THEN
    ALTER TABLE club_season_registration_settings
      ADD CONSTRAINT club_season_registration_terms_json_check
      CHECK (
        jsonb_typeof(terms_sections) = 'array'
        AND jsonb_array_length(terms_sections) IN (0, 6)
        AND octet_length(terms_sections::text) <= 60000
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS club_season_registration_inherited_from_idx
  ON club_season_registration_settings(inherited_from_id);

CREATE OR REPLACE FUNCTION initialise_club_season_registration_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  source_settings club_season_registration_settings%ROWTYPE;
  copied_options JSONB := '[]'::jsonb;
  derived_title TEXT;
BEGIN
  derived_title := regexp_replace(NEW.name, '\s+Season$', '', 'i') || ' Player Registration';

  IF NEW.source_season_id IS NOT NULL THEN
    SELECT settings.*
      INTO source_settings
      FROM club_season_registration_settings settings
      WHERE settings.club_season_id = NEW.source_season_id
      LIMIT 1;
  END IF;

  IF source_settings.id IS NOT NULL THEN
    SELECT COALESCE(
      jsonb_agg(
        (option_value - 'registration_url' - 'is_active')
        || jsonb_build_object('registration_url', '', 'is_active', FALSE)
        ORDER BY option_ordinality
      ),
      '[]'::jsonb
    )
      INTO copied_options
      FROM jsonb_array_elements(source_settings.registration_options)
        WITH ORDINALITY AS options(option_value, option_ordinality);
  END IF;

  INSERT INTO club_season_registration_settings (
    club_season_id,
    status,
    page_title,
    navigation_label,
    intro_text,
    show_in_navigation,
    registration_options,
    terms_title,
    terms_sections,
    inherited_from_id
  ) VALUES (
    NEW.id,
    'closed',
    derived_title,
    derived_title,
    COALESCE(source_settings.intro_text, ''),
    FALSE,
    copied_options,
    COALESCE(source_settings.terms_title, 'Newcomb and District Cricket Club - Terms and Conditions'),
    COALESCE(source_settings.terms_sections, '[]'::jsonb),
    source_settings.id
  )
  ON CONFLICT (club_season_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION initialise_club_season_registration_settings() IS
  'Initialises a new season closed and hidden, copying labels and terms while clearing registration URLs.';

REVOKE ALL ON FUNCTION initialise_club_season_registration_settings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION initialise_club_season_registration_settings() TO postgres, service_role;

DROP TRIGGER IF EXISTS trg_initialise_club_season_registration ON club_seasons;
CREATE TRIGGER trg_initialise_club_season_registration
AFTER INSERT ON club_seasons
FOR EACH ROW EXECUTE FUNCTION initialise_club_season_registration_settings();

-- Backfill any seasons created after the original club-season migration but
-- before this initialisation trigger existed. They remain closed and hidden.
INSERT INTO club_season_registration_settings (
  club_season_id,
  status,
  registration_url,
  page_title,
  navigation_label,
  show_in_navigation,
  registration_options,
  terms_sections
)
SELECT
  seasons.id,
  'closed',
  NULL,
  regexp_replace(seasons.name, '\s+Season$', '', 'i') || ' Player Registration',
  regexp_replace(seasons.name, '\s+Season$', '', 'i') || ' Player Registration',
  FALSE,
  '[]'::jsonb,
  '[]'::jsonb
FROM club_seasons seasons
ON CONFLICT (club_season_id) DO NOTHING;

WITH target_season AS (
  SELECT id
  FROM club_seasons
  WHERE slug = '2026-27'
  ORDER BY is_current DESC, created_at DESC
  LIMIT 1
)
INSERT INTO club_season_registration_settings (
  club_season_id,
  status,
  registration_url,
  page_title,
  navigation_label,
  intro_text,
  show_in_navigation,
  registration_options,
  terms_title,
  terms_sections
)
SELECT
  target_season.id,
  'open',
  NULL,
  '2026/2027 Player Registration',
  '2026/2027 Player Registration',
  'Choose the appropriate registration option below. Registration is completed securely through PlayHQ.',
  TRUE,
  jsonb_build_array(
    jsonb_build_object(
      'audience_key', 'senior_women',
      'label', 'Senior Women''s Registration',
      'registration_url', 'https://www.playhq.com/cricket-australia/register/f8866f',
      'sort_order', 1,
      'is_active', TRUE
    ),
    jsonb_build_object(
      'audience_key', 'senior_men',
      'label', 'Senior Men''s Registration',
      'registration_url', 'https://www.playhq.com/cricket-australia/register/e7483f',
      'sort_order', 2,
      'is_active', TRUE
    ),
    jsonb_build_object(
      'audience_key', 'junior',
      'label', 'Junior Registration',
      'registration_url', 'https://www.playhq.com/cricket-australia/register/7c4466',
      'sort_order', 3,
      'is_active', TRUE
    )
  ),
  'Newcomb and District Cricket Club - Terms and Conditions',
  jsonb_build_array(
    jsonb_build_object(
      'heading', 'Respect and Behaviour',
      'body', 'All players, parents, volunteers and spectators must demonstrate respectful behaviour at all times. Abusive, discriminatory, threatening or antisocial conduct towards players, officials, volunteers or opposition teams will not be tolerated. Individuals are expected to uphold the values of fair play, integrity and positive participation.'
    ),
    jsonb_build_object(
      'heading', 'Sportsmanship',
      'body', 'Members must display good sportsmanship on and off the field. This includes accepting umpire decisions, encouraging teammates, respecting opponents, and contributing to a safe and enjoyable environment for all participants.'
    ),
    jsonb_build_object(
      'heading', 'Alcohol, Drugs and Smoking',
      'body', 'The Club maintains a strict no-drug policy. The use, possession or distribution of illegal substances is prohibited at all Club activities. Alcohol consumption must comply with venue rules and responsible service guidelines. Smoking and vaping are not permitted in or around playing areas, training zones or junior activities.'
    ),
    jsonb_build_object(
      'heading', 'Child Safety and Welfare',
      'body', 'The Club is committed to providing a safe environment for children. All coaches, volunteers and program coordinators must comply with Victorian Child Safe Standards and hold a valid Working With Children Check. Any behaviour that compromises child safety will result in immediate action.'
    ),
    jsonb_build_object(
      'heading', 'Participation and Conduct Requirements',
      'body', 'Players and parents agree to follow all reasonable directions from coaches, team managers and Club officials. This includes training expectations, match-day requirements, safety instructions and adherence to Club policies.'
    ),
    jsonb_build_object(
      'heading', 'Disciplinary Action',
      'body', 'Breaches of these Terms and Conditions may result in warnings, suspension from activities, or removal from Club programs. Serious misconduct may be referred to relevant authorities or governing bodies.'
    )
  )
FROM target_season
ON CONFLICT (club_season_id) DO UPDATE SET
  status = EXCLUDED.status,
  registration_url = NULL,
  page_title = EXCLUDED.page_title,
  navigation_label = EXCLUDED.navigation_label,
  intro_text = EXCLUDED.intro_text,
  show_in_navigation = EXCLUDED.show_in_navigation,
  registration_options = EXCLUDED.registration_options,
  terms_title = EXCLUDED.terms_title,
  terms_sections = EXCLUDED.terms_sections,
  updated_at = NOW();

-- The public page reads through the server-only DTO mapper. Direct PostgREST
-- access would expose inactive options and internal seasonal metadata, so the
-- complete settings row is not granted to browser roles.
REVOKE ALL ON TABLE club_season_registration_settings FROM anon, authenticated;

DROP POLICY IF EXISTS club_season_registration_public ON club_season_registration_settings;

NOTIFY pgrst, 'reload schema';
