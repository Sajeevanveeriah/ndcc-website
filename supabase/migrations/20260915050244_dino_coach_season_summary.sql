-- Source: 5227829ea185f6dfbc5bfdfce902efdb2d6b57c5221a7fb24bb14e9066e39697, supplied 2025/2026 seven-grade workbook.
-- No match-level history is fabricated. Existing unreported players stay unrated.
CREATE OR REPLACE FUNCTION public.dino_coach_release_readiness(target_season_id uuid)
 RETURNS TABLE(ready boolean, selectable_players bigint, resolved_players bigint, positive_published_prices bigint, ambiguous_identities bigint, duplicate_source_links bigint, blockers text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH roster AS (
  SELECT sp.player_id, sp.stats_status
  FROM public.fantasy_season_players sp
  WHERE sp.season_id = target_season_id AND sp.active AND sp.selectable
), prices AS (
  SELECT DISTINCT ON (p.player_id) p.player_id, p.price_dino_dollars, p.published_at
  FROM public.fantasy_player_prices p
  WHERE p.season_id = target_season_id
  ORDER BY p.player_id, p.created_at DESC
), counts AS (
  SELECT
    COUNT(*)::BIGINT AS selectable,
    COUNT(*) FILTER (WHERE r.stats_status IN (
      'verified_playhq','verified_no_prior_appearance','international_manual',
      'international_premium','provisional_baseline','season_summary','unrated'
    ))::BIGINT AS resolved,
    COUNT(*) FILTER (WHERE p.price_dino_dollars > 0 AND p.published_at IS NOT NULL)::BIGINT AS published
  FROM roster r LEFT JOIN prices p ON p.player_id = r.player_id
), identity AS (
  SELECT
    COUNT(*) FILTER (WHERE decision = 'review_required')::BIGINT AS ambiguous,
    GREATEST(COUNT(*) - COUNT(DISTINCT playhq_player_id), 0)::BIGINT AS duplicates
  FROM public.fantasy_player_identity_audit
  WHERE season_id = target_season_id AND playhq_player_id IS NOT NULL
)
SELECT
  c.selectable > 0 AND c.resolved = c.selectable AND c.published = c.selectable
    AND i.ambiguous = 0 AND i.duplicates = 0,
  c.selectable, c.resolved, c.published, i.ambiguous, i.duplicates,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN c.selectable = 0 THEN 'No selectable players are configured.' END,
    CASE WHEN c.resolved <> c.selectable THEN (c.selectable-c.resolved)||' player outcomes are unresolved.' END,
    CASE WHEN c.published <> c.selectable THEN (c.selectable-c.published)||' player prices are not positive and published.' END,
    CASE WHEN i.ambiguous > 0 THEN i.ambiguous||' ambiguous identity decisions remain.' END,
    CASE WHEN i.duplicates > 0 THEN i.duplicates||' duplicate PlayHQ source links remain.' END
  ], NULL)::TEXT[]
FROM counts c CROSS JOIN identity i;
$function$
;
REVOKE ALL ON FUNCTION public.dino_coach_release_readiness(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dino_coach_release_readiness(uuid) TO service_role;

DO $migration$
DECLARE sid uuid; item jsonb; pid uuid; matches integer; best numeric := 913; stamp timestamptz := now();
BEGIN
 SELECT id INTO sid FROM public.fantasy_seasons WHERE slug='2026-27';
 IF sid IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.fantasy_entries WHERE season_id=sid AND status='paid') THEN
  RAISE EXCEPTION 'Opening prices cannot be replaced after a paid entry.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.fantasy_squads WHERE season_id=sid) THEN
  RAISE EXCEPTION 'Opening prices cannot be replaced after a squad exists.';
 END IF;
 -- Keep launch closed until application deployment has passed its release checks.
 UPDATE public.fantasy_dino_settings SET public_launch_enabled=false,
 entry_fee_cents=2500, budget_dino_dollars=20000000,
 initial_price_floor_dino_dollars=500000,initial_price_ceiling_dino_dollars=2000000,
 price_point_value_dino_dollars=10000,rules_version='2026-27-rev03',updated_at=stamp WHERE season_id=sid;
 UPDATE public.fantasy_season_players SET role='UNASSIGNED',stats_status='unrated',
 prior_regular_appearances=0,prior_average_points=0,updated_at=stamp
 WHERE season_id=sid AND active AND selectable;
 FOR item IN SELECT value FROM jsonb_array_elements('[{"baseline":53.7059,"complete_matches":true,"evidence":{"catches":5,"runs":663,"source_rows":["Mens 1st!A26:N26"],"stumpings":0,"wickets":20},"grades":"Mens 1st","matches":17,"name":"Anthony Quarrell","points":913,"price":2000000,"role":"AR","source_name":"Anthony Quarrell"},{"baseline":36.0435,"complete_matches":false,"evidence":{"catches":6,"runs":536,"source_rows":["U17!A8:N8","Mens 3rd!A13:N13","Mens 4th!A13:N13"],"stumpings":0,"wickets":28},"grades":"U17 / Mens 3rd / Mens 4th","matches":23,"name":"Rueben Brady","points":876,"price":1939211,"role":"AR","source_name":"Rueben Brady"},{"baseline":42.7895,"complete_matches":true,"evidence":{"catches":4,"runs":543,"source_rows":["Mens 1st!A19:N19","Mens 2nd!A19:N19","Mens 3rd!A30:N30"],"stumpings":0,"wickets":23},"grades":"Mens 1st / Mens 2nd / Mens 3rd","matches":19,"name":"Scott Kirby","points":813,"price":1835706,"role":"AR","source_name":"Scott Kirby"},{"baseline":44.3529,"complete_matches":true,"evidence":{"catches":11,"runs":614,"source_rows":["Mens 1st!A25:N25"],"stumpings":0,"wickets":3},"grades":"Mens 1st","matches":17,"name":"Tyler O’Neill","points":754,"price":1738773,"role":"BAT","source_name":"Tyler O’Neill"},{"baseline":32.2105,"complete_matches":true,"evidence":{"catches":6,"runs":432,"source_rows":["Mens 1st!A24:N24"],"stumpings":0,"wickets":12},"grades":"Mens 1st","matches":19,"name":"Huey Nield","points":612,"price":1505476,"role":"AR","source_name":"Huey Nield"},{"baseline":42.1429,"complete_matches":false,"evidence":{"catches":4,"runs":426,"source_rows":["Mens 2nd!A28:N28","Mens 3rd!A44:N44"],"stumpings":0,"wickets":14},"grades":"Mens 2nd / Mens 3rd","matches":14,"name":"D Whitworth","points":606,"price":1495619,"role":"AR","source_name":"Daniel Whitworth"},{"baseline":34.7647,"complete_matches":true,"evidence":{"catches":5,"runs":301,"source_rows":["Mens 1st!A27:N27"],"stumpings":0,"wickets":24},"grades":"Mens 1st","matches":17,"name":"Blake Ritchie","points":591,"price":1470975,"role":"AR","source_name":"Blake Ritchie"},{"baseline":31.7778,"complete_matches":true,"evidence":{"catches":7,"runs":332,"source_rows":["Mens 1st!A11:N11"],"stumpings":0,"wickets":17},"grades":"Mens 1st","matches":18,"name":"Cam Egan","points":572,"price":1439759,"role":"AR","source_name":"Cam Egan"},{"baseline":31.1176,"complete_matches":false,"evidence":{"catches":7,"runs":233,"source_rows":["Mens 1st!A12:N12","Mens 2nd!A13:N13","Mens 3rd!A21:N21"],"stumpings":0,"wickets":23},"grades":"Mens 1st / Mens 2nd / Mens 3rd","matches":17,"name":"John Elliott","points":533,"price":1375685,"role":"AR","source_name":"John Elliott"},{"baseline":30.6471,"complete_matches":true,"evidence":{"catches":6,"runs":191,"source_rows":["Mens 2nd!A26:N26"],"stumpings":0,"wickets":27},"grades":"Mens 2nd","matches":17,"name":"Matty Penman","points":521,"price":1355969,"role":"AR","source_name":"Matthew Penman"},{"baseline":26.3333,"complete_matches":false,"evidence":{"catches":13,"runs":214,"source_rows":["U17!A17:N17","Mens 1st!A22:N22","Mens 2nd!A23:N23"],"stumpings":0,"wickets":14},"grades":"U17 / Mens 1st / Mens 2nd","matches":18,"name":"Ben Miles","points":484,"price":1295181,"role":"AR","source_name":"Benjamin Miles"},{"baseline":33.5714,"complete_matches":false,"evidence":{"catches":7,"runs":374,"source_rows":["Mens 1st!A21:N21","Mens 2nd!A21:N21"],"stumpings":0,"wickets":4},"grades":"Mens 1st / Mens 2nd","matches":14,"name":"Cam MacBryde","points":484,"price":1295181,"role":"BAT","source_name":"Cameron Macbryde"},{"baseline":28.6,"complete_matches":false,"evidence":{"catches":6,"runs":319,"source_rows":["Mens 1st!A9:N9","Mens 2nd!A9:N9","Mens 3rd!A8:N8","Mens 4th!A10:N10"],"stumpings":1,"wickets":6},"grades":"Mens 1st / Mens 2nd / Mens 3rd / Mens 4th","matches":15,"name":"Garth Ballantine","points":449,"price":1237678,"role":"WK","source_name":"Garth Ballantine"},{"baseline":30.2857,"complete_matches":true,"evidence":{"catches":4,"runs":274,"source_rows":["Mens 1st!A17:N17","Mens 2nd!A17:N17","Mens 3rd!A29:N29"],"stumpings":0,"wickets":11},"grades":"Mens 1st / Mens 2nd / Mens 3rd","matches":14,"name":"Edward Hurst","points":424,"price":1196605,"role":"AR","source_name":"Edward Hurst"},{"baseline":23.5294,"complete_matches":true,"evidence":{"catches":4,"runs":60,"source_rows":["Mens 1st!A18:N18","Mens 2nd!A18:N18"],"stumpings":0,"wickets":30},"grades":"Mens 1st / Mens 2nd","matches":17,"name":"Nathan Keevil","points":400,"price":1157174,"role":"BOWL","source_name":"Nathan Keevil"},{"baseline":15.64,"complete_matches":true,"evidence":{"catches":6,"runs":211,"source_rows":["U17!A9:N9","Mens 2nd!A12:N12","Mens 3rd!A16:N16"],"stumpings":0,"wickets":12},"grades":"U17 / Mens 2nd / Mens 3rd","matches":25,"name":"Hayden Butler","points":391,"price":1142388,"role":"AR","source_name":"Hayden Butler"},{"baseline":24.1875,"complete_matches":true,"evidence":{"catches":4,"runs":337,"source_rows":["Mens 3rd!A34:N34"],"stumpings":0,"wickets":1},"grades":"Mens 3rd","matches":16,"name":"Rick Mchutchison","points":387,"price":1135816,"role":"BAT","source_name":"Rick Mchutchison"},{"baseline":21.1667,"complete_matches":true,"evidence":{"catches":12,"runs":241,"source_rows":["Mens 1st!A23:N23"],"stumpings":2,"wickets":0},"grades":"Mens 1st","matches":18,"name":"Aaron Morgan","points":381,"price":1125958,"role":"WK","source_name":"Aaron Morgan"},{"baseline":22.125,"complete_matches":true,"evidence":{"catches":6,"runs":164,"source_rows":["U13!A10:N10"],"stumpings":0,"wickets":13},"grades":"U13","matches":16,"name":"Aidan Chand","points":354,"price":1081599,"role":"AR","source_name":"Aidan Chand"},{"baseline":26.3846,"complete_matches":true,"evidence":{"catches":3,"runs":293,"source_rows":["Mens 1st!A20:N20","Mens 2nd!A20:N20","Mens 3rd!A31:N31"],"stumpings":0,"wickets":2},"grades":"Mens 1st / Mens 2nd / Mens 3rd","matches":13,"name":"Nathan Laffy","points":343,"price":1063527,"role":"BAT","source_name":"Nathan Laffy"},{"baseline":28.5,"complete_matches":true,"evidence":{"catches":2,"runs":92,"source_rows":["Mens 3rd!A32:N32"],"stumpings":0,"wickets":23},"grades":"Mens 3rd","matches":12,"name":"Siva Madanon Pillai","points":342,"price":1061884,"role":"AR","source_name":"Sivasankar Madanon Pillai"},{"baseline":18.4444,"complete_matches":true,"evidence":{"catches":4,"runs":192,"source_rows":["U13!A12:N12","U17!A10:N10"],"stumpings":0,"wickets":10},"grades":"U13 / U17","matches":18,"name":"Liam Cox","points":332,"price":1045455,"role":"AR","source_name":"Liam Cox"},{"baseline":18.2778,"complete_matches":true,"evidence":{"catches":7,"runs":139,"source_rows":["Mens 1st!A14:N14"],"stumpings":0,"wickets":12},"grades":"Mens 1st","matches":18,"name":"Harro Harrison","points":329,"price":1040526,"role":"AR","source_name":"Daniel Harrison"},{"baseline":20.25,"complete_matches":true,"evidence":{"catches":6,"runs":254,"source_rows":["Mens 1st!A10:N10","Mens 2nd!A10:N10"],"stumpings":0,"wickets":1},"grades":"Mens 1st / Mens 2nd","matches":16,"name":"Rhys Bath","points":324,"price":1032311,"role":"BAT","source_name":"Rhys Bath"},{"baseline":16.6842,"complete_matches":true,"evidence":{"catches":6,"runs":27,"source_rows":["Mens 1st!A28:N28"],"stumpings":0,"wickets":23},"grades":"Mens 1st","matches":19,"name":"Jason Robertson","points":317,"price":1020811,"role":"BOWL","source_name":"Jason Robertson"},{"baseline":20.7333,"complete_matches":true,"evidence":{"catches":2,"runs":171,"source_rows":["U13!A17:N17"],"stumpings":0,"wickets":12},"grades":"U13","matches":15,"name":"Lucas Rickards","points":311,"price":1010953,"role":"AR","source_name":"Lucas Rickards"},{"baseline":12.9167,"complete_matches":false,"evidence":{"catches":0,"runs":290,"source_rows":["U17!A14:N14","Mens 2nd!A15:N15","Mens 3rd!A25:N25","Mens 4th!A21:N21"],"stumpings":0,"wickets":2},"grades":"U17 / Mens 2nd / Mens 3rd / Mens 4th","matches":24,"name":"Cooper Giuricin-Webb","points":310,"price":1009310,"role":"BAT","source_name":"Cooper Giuricin-Webb"},{"baseline":25.2727,"complete_matches":false,"evidence":{"catches":6,"runs":178,"source_rows":["Mens 3rd!A43:N43","Mens 4th!A33:N33"],"stumpings":0,"wickets":7},"grades":"Mens 3rd / Mens 4th","matches":11,"name":"Saj Veeriah","points":308,"price":1006024,"role":"AR","source_name":"Sajeevan Veeriah"},{"baseline":38.375,"complete_matches":true,"evidence":{"catches":1,"runs":197,"source_rows":["Mens 3rd!A41:N41"],"stumpings":0,"wickets":10},"grades":"Mens 3rd","matches":8,"name":"Manu Sehajpal","points":307,"price":1004381,"role":"AR","source_name":"Manu Sehajpal"},{"baseline":16.6471,"complete_matches":false,"evidence":{"catches":22,"runs":75,"source_rows":["Mens 1st!A15:N15","Mens 2nd!A16:N16","Mens 3rd!A27:N27"],"stumpings":1,"wickets":0},"grades":"Mens 1st / Mens 2nd / Mens 3rd","matches":17,"name":"Tyson Henry","points":305,"price":1001095,"role":"WK","source_name":"Tyson Henry"},{"baseline":35.625,"complete_matches":false,"evidence":{"catches":5,"runs":162,"source_rows":["Mens 3rd!A42:N42","Mens 4th!A32:N32"],"stumpings":0,"wickets":9},"grades":"Mens 3rd / Mens 4th","matches":8,"name":"Mani Veduruveda","points":302,"price":996166,"role":"AR","source_name":"Bharath Veduruveda"},{"baseline":16.25,"complete_matches":false,"evidence":{"catches":10,"runs":60,"source_rows":["U17!A16:N16","Mens 2nd!A22:N22","Mens 3rd!A35:N35","Mens 4th!A26:N26"],"stumpings":0,"wickets":14},"grades":"U17 / Mens 2nd / Mens 3rd / Mens 4th","matches":16,"name":"Brock Mcphee","points":300,"price":992881,"role":"AR","source_name":"Brock Mcphee"},{"baseline":29.8,"complete_matches":true,"evidence":{"catches":3,"runs":188,"source_rows":["U17!A18:N18"],"stumpings":0,"wickets":8},"grades":"U17","matches":10,"name":"Jack Northfield","points":298,"price":989595,"role":"AR","source_name":"Jack Northfield"},{"baseline":17.6875,"complete_matches":false,"evidence":{"catches":6,"runs":102,"source_rows":["U17!A13:N13","Mens 1st!A13:N13","Mens 2nd!A14:N14","Mens 3rd!A24:N24"],"stumpings":0,"wickets":13},"grades":"U17 / Mens 1st / Mens 2nd / Mens 3rd","matches":16,"name":"Josh Fothergill","points":292,"price":979737,"role":"AR","source_name":"Josh Fothergill"},{"baseline":16.9412,"complete_matches":true,"evidence":{"catches":4,"runs":248,"source_rows":["Mens 3rd!A10:N10"],"stumpings":0,"wickets":0},"grades":"Mens 3rd","matches":17,"name":"Rob Bell","points":288,"price":973165,"role":"BAT","source_name":"Robert Bell"},{"baseline":15.8333,"complete_matches":true,"evidence":{"catches":3,"runs":65,"source_rows":["Mens 1st!A8:N8","Mens 2nd!A8:N8"],"stumpings":0,"wickets":19},"grades":"Mens 1st / Mens 2nd","matches":18,"name":"Jake Baker","points":285,"price":968237,"role":"AR","source_name":"Jake Baker"},{"baseline":17.6875,"complete_matches":true,"evidence":{"catches":0,"runs":93,"source_rows":["Mens 3rd!A15:N15","Mens 4th!A14:N14"],"stumpings":0,"wickets":19},"grades":"Mens 3rd / Mens 4th","matches":16,"name":"Callum Brownlie","points":283,"price":964951,"role":"AR","source_name":"Callum Brownlie"},{"baseline":18.4667,"complete_matches":true,"evidence":{"catches":7,"runs":7,"source_rows":["Mens 3rd!A20:N20","Mens 4th!A18:N18"],"stumpings":0,"wickets":20},"grades":"Mens 3rd / Mens 4th","matches":15,"name":"Adrian Edgerton","points":277,"price":955093,"role":"BOWL","source_name":"Adrian Edgerton"},{"baseline":13.7647,"complete_matches":false,"evidence":{"catches":7,"runs":69,"source_rows":["Mens 2nd!A30:N30","Mens 3rd!A46:N46"],"stumpings":0,"wickets":13},"grades":"Mens 2nd / Mens 3rd","matches":17,"name":"Devlin Wootton","points":269,"price":941950,"role":"AR","source_name":"Devlin Wootton"},{"baseline":17.8667,"complete_matches":true,"evidence":{"catches":4,"runs":168,"source_rows":["U13!A16:N16"],"stumpings":0,"wickets":6},"grades":"U13","matches":15,"name":"Blake Reed","points":268,"price":940307,"role":"AR","source_name":"Blake Reed"},{"baseline":22.25,"complete_matches":true,"evidence":{"catches":7,"runs":47,"source_rows":["Mens 4th!A9:N9"],"stumpings":0,"wickets":15},"grades":"Mens 4th","matches":12,"name":"Shane Baker","points":267,"price":938664,"role":"BOWL","source_name":"Shane Baker"},{"baseline":16.375,"complete_matches":true,"evidence":{"catches":1,"runs":172,"source_rows":["U13!A19:N19"],"stumpings":0,"wickets":8},"grades":"U13","matches":16,"name":"Angus Welling","points":262,"price":930449,"role":"AR","source_name":"Angus Welling"},{"baseline":30.25,"complete_matches":false,"evidence":{"catches":4,"runs":212,"source_rows":["Mens 3rd!A23:N23","Mens 4th!A20:N20"],"stumpings":0,"wickets":0},"grades":"Mens 3rd / Mens 4th","matches":8,"name":"Andrew Fothergill","points":252,"price":914020,"role":"WK","source_name":"Andrew Fothergill"},{"baseline":17.7857,"complete_matches":true,"evidence":{"catches":3,"runs":119,"source_rows":["U13!A14:N14"],"stumpings":0,"wickets":10},"grades":"U13","matches":14,"name":"Craig Moorfoot","points":249,"price":909091,"role":"AR","source_name":"Craig Moorfoot"},{"baseline":19.3333,"complete_matches":true,"evidence":{"catches":0,"runs":222,"source_rows":["Mens 1st!A31:N31","Mens 2nd!A29:N29"],"stumpings":0,"wickets":1},"grades":"Mens 1st / Mens 2nd","matches":12,"name":"Harry Wilkes","points":232,"price":881161,"role":"BAT","source_name":"Harry Wilkes"},{"baseline":15.6429,"complete_matches":false,"evidence":{"catches":2,"runs":139,"source_rows":["Mens 3rd!A33:N33","Mens 4th!A25:N25","Womens!A19:N19"],"stumpings":0,"wickets":6},"grades":"Mens 3rd / Mens 4th / Womens","matches":14,"name":"Emilia Maddison","points":219,"price":859803,"role":"AR","source_name":"Emilia Maddison"},{"baseline":15,"complete_matches":true,"evidence":{"catches":5,"runs":135,"source_rows":["Mens 2nd!A25:N25","Mens 3rd!A39:N39"],"stumpings":0,"wickets":1},"grades":"Mens 2nd / Mens 3rd","matches":13,"name":"Marcus Pearson","points":195,"price":820372,"role":"BAT","source_name":"Marcus Pearson"},{"baseline":12.1333,"complete_matches":true,"evidence":{"catches":2,"runs":92,"source_rows":["U13!A18:N18"],"stumpings":0,"wickets":7},"grades":"U13","matches":15,"name":"Rehan Shaikh","points":182,"price":799014,"role":"AR","source_name":"Rehan Shaikh"},{"baseline":10.6471,"complete_matches":true,"evidence":{"catches":2,"runs":121,"source_rows":["U13!A13:N13","U17!A15:N15"],"stumpings":0,"wickets":4},"grades":"U13 / U17","matches":17,"name":"Archie Hayes","points":181,"price":797371,"role":"AR","source_name":"Archie Hayes"},{"baseline":15.0833,"complete_matches":true,"evidence":{"catches":2,"runs":31,"source_rows":["Mens 2nd!A24:N24","Mens 3rd!A38:N38"],"stumpings":0,"wickets":13},"grades":"Mens 2nd / Mens 3rd","matches":12,"name":"Jaykeb Paley","points":181,"price":797371,"role":"BOWL","source_name":"Jaykeb Paley"},{"baseline":14.5,"complete_matches":false,"evidence":{"catches":1,"runs":104,"source_rows":["Mens 4th!A27:N27","Womens!A20:N20"],"stumpings":0,"wickets":6},"grades":"Mens 4th / Womens","matches":12,"name":"Ruby Moreland","points":174,"price":785871,"role":"AR","source_name":"Ruby Moreland"},{"baseline":10.8571,"complete_matches":false,"evidence":{"catches":4,"runs":125,"source_rows":["Mens 3rd!A18:N18","Mens 4th!A16:N16"],"stumpings":0,"wickets":0},"grades":"Mens 3rd / Mens 4th","matches":14,"name":"Archie Chinn","points":165,"price":771084,"role":"BAT","source_name":"Archie Chinn"},{"baseline":9.75,"complete_matches":true,"evidence":{"catches":1,"runs":116,"source_rows":["Mens 3rd!A45:N45"],"stumpings":0,"wickets":3},"grades":"Mens 3rd","matches":16,"name":"Troy Whitworth","points":156,"price":756298,"role":"AR","source_name":"Troy Whitworth"},{"baseline":11.1429,"complete_matches":true,"evidence":{"catches":0,"runs":76,"source_rows":["Mens 4th!A8:N8"],"stumpings":0,"wickets":8},"grades":"Mens 4th","matches":14,"name":"Dylan Baker","points":156,"price":756298,"role":"AR","source_name":"Dylan Baker"},{"baseline":9.7857,"complete_matches":false,"evidence":{"catches":5,"runs":75,"source_rows":["U17!A20:N20","Mens 3rd!A40:N40","Mens 4th!A30:N30"],"stumpings":0,"wickets":2},"grades":"U17 / Mens 3rd / Mens 4th","matches":14,"name":"Scaff Scaffidi","points":145,"price":738226,"role":"BAT","source_name":"Antonio Scaffidi"},{"baseline":13.7,"complete_matches":true,"evidence":{"catches":0,"runs":137,"source_rows":["Mens 1st!A29:N29","Mens 2nd!A27:N27"],"stumpings":0,"wickets":0},"grades":"Mens 1st / Mens 2nd","matches":10,"name":"Josh Walker","points":137,"price":725082,"role":"BAT","source_name":"Josh Walker"},{"baseline":13.5,"complete_matches":true,"evidence":{"catches":2,"runs":85,"source_rows":["U17!A22:N22"],"stumpings":0,"wickets":3},"grades":"U17","matches":10,"name":"Harry Wells","points":135,"price":721796,"role":"AR","source_name":"Harry Wells"},{"baseline":15,"complete_matches":false,"evidence":{"catches":2,"runs":114,"source_rows":["Mens 3rd!A17:N17","Mens 4th!A15:N15"],"stumpings":0,"wickets":0},"grades":"Mens 3rd / Mens 4th","matches":8,"name":"Aaron Chinn","points":134,"price":720153,"role":"BAT","source_name":"Aaron Chinn"},{"baseline":9.6923,"complete_matches":true,"evidence":{"catches":2,"runs":56,"source_rows":["Womens!A8:N8"],"stumpings":0,"wickets":5},"grades":"Womens","matches":13,"name":"Katie Appleyard","points":126,"price":707010,"role":"AR","source_name":"Kathryn Appleyard"},{"baseline":9.4615,"complete_matches":true,"evidence":{"catches":2,"runs":33,"source_rows":["Mens 2nd!A11:N11","Mens 3rd!A9:N9"],"stumpings":0,"wickets":7},"grades":"Mens 2nd / Mens 3rd","matches":13,"name":"Michael Begg","points":123,"price":702081,"role":"BOWL","source_name":"Michael Begg"},{"baseline":11.1,"complete_matches":false,"evidence":{"catches":0,"runs":96,"source_rows":["Mens 4th!A23:N23","Womens!A16:N16"],"stumpings":0,"wickets":2},"grades":"Mens 4th / Womens","matches":10,"name":"Carly Hillgrove","points":116,"price":690581,"role":"BAT","source_name":"Carly Hillgrove"},{"baseline":9.3333,"complete_matches":true,"evidence":{"catches":1,"runs":92,"source_rows":["Womens!A12:N12"],"stumpings":0,"wickets":1},"grades":"Womens","matches":12,"name":"Samantha Barry","points":112,"price":684009,"role":"BAT","source_name":"Samantha Barry"},{"baseline":6.5294,"complete_matches":true,"evidence":{"catches":3,"runs":21,"source_rows":["U17!A21:N21","Mens 4th!A31:N31"],"stumpings":0,"wickets":6},"grades":"U17 / Mens 4th","matches":17,"name":"Max Troop","points":111,"price":682366,"role":"BOWL","source_name":"Max Troop"},{"baseline":15.5714,"complete_matches":true,"evidence":{"catches":1,"runs":69,"source_rows":["Mens 4th!A12:N12"],"stumpings":0,"wickets":3},"grades":"Mens 4th","matches":7,"name":"Cam Brady","points":109,"price":679080,"role":"AR","source_name":"Cameron Brady"},{"baseline":8.6667,"complete_matches":true,"evidence":{"catches":3,"runs":64,"source_rows":["U13!A9:N9"],"stumpings":0,"wickets":1},"grades":"U13","matches":12,"name":"Kieran Anderton","points":104,"price":670865,"role":"BAT","source_name":"Kieran Anderton"},{"baseline":16.8333,"complete_matches":true,"evidence":{"catches":0,"runs":21,"source_rows":["Mens 3rd!A11:N11"],"stumpings":0,"wickets":8},"grades":"Mens 3rd","matches":6,"name":"Aashish Bhusal","points":101,"price":665936,"role":"BOWL","source_name":"Aashish Bhusal"},{"baseline":11.5714,"complete_matches":false,"evidence":{"catches":5,"runs":48,"source_rows":["Mens 3rd!A19:N19","Mens 4th!A17:N17"],"stumpings":0,"wickets":0},"grades":"Mens 3rd / Mens 4th","matches":7,"name":"Andrew Doyle","points":98,"price":661008,"role":"BAT","source_name":"Andrew Doyle"},{"baseline":10.5556,"complete_matches":true,"evidence":{"catches":5,"runs":45,"source_rows":["Mens 3rd!A37:N37","Mens 4th!A28:N28"],"stumpings":0,"wickets":0},"grades":"Mens 3rd / Mens 4th","matches":9,"name":"Brayden Paley","points":95,"price":656079,"role":"BAT","source_name":"Brayden Paley"},{"baseline":6.6429,"complete_matches":true,"evidence":{"catches":2,"runs":13,"source_rows":["U17!A19:N19","Mens 4th!A29:N29"],"stumpings":0,"wickets":6},"grades":"U17 / Mens 4th","matches":14,"name":"Brad Robertson","points":93,"price":652793,"role":"BOWL","source_name":"Bradley Robertson"},{"baseline":8,"complete_matches":true,"evidence":{"catches":0,"runs":28,"source_rows":["Womens!A10:N10"],"stumpings":0,"wickets":6},"grades":"Womens","matches":11,"name":"Shayla Barnes","points":88,"price":644578,"role":"BOWL","source_name":"Shayla Barnes"},{"baseline":6.5385,"complete_matches":false,"evidence":{"catches":4,"runs":35,"source_rows":["Mens 3rd!A12:N12","Mens 4th!A11:N11"],"stumpings":0,"wickets":1},"grades":"Mens 3rd / Mens 4th","matches":13,"name":"Enrique Biyik","points":85,"price":639650,"role":"BAT","source_name":"Enrique Biyik"},{"baseline":5.125,"complete_matches":true,"evidence":{"catches":0,"runs":22,"source_rows":["U13!A15:N15"],"stumpings":0,"wickets":6},"grades":"U13","matches":16,"name":"Maverick Quinn","points":82,"price":634721,"role":"BOWL","source_name":"Maverick Quinn"},{"baseline":15.25,"complete_matches":true,"evidence":{"catches":1,"runs":31,"source_rows":["Mens 1st!A30:N30"],"stumpings":0,"wickets":2},"grades":"Mens 1st","matches":4,"name":"Matthew West","points":61,"price":600219,"role":"BAT","source_name":"Matthew West"},{"baseline":5.6,"complete_matches":false,"evidence":{"catches":1,"runs":6,"source_rows":["U17!A11:N11","Mens 4th!A19:N19"],"stumpings":0,"wickets":4},"grades":"U17 / Mens 4th","matches":10,"name":"Noah Evans","points":56,"price":592004,"role":"BOWL","source_name":"Noah Evans"},{"baseline":20,"complete_matches":false,"evidence":{"catches":2,"runs":30,"source_rows":["Mens 1st!A16:N16","Mens 3rd!A28:N28"],"stumpings":0,"wickets":0},"grades":"Mens 1st / Mens 3rd","matches":1,"name":"Craig Hillgrove","points":50,"price":582147,"role":"BAT","source_name":"Craig Hillgrove"},{"baseline":3.5385,"complete_matches":false,"evidence":{"catches":1,"runs":37,"source_rows":["Mens 4th!A24:N24","Womens!A17:N17"],"stumpings":0,"wickets":0},"grades":"Mens 4th / Womens","matches":13,"name":"Laura Hudson","points":47,"price":577218,"role":"WK","source_name":"Laura Hudson"},{"baseline":8.8,"complete_matches":true,"evidence":{"catches":0,"runs":24,"source_rows":["U13!A11:N11"],"stumpings":0,"wickets":2},"grades":"U13","matches":5,"name":"Ollie Coombs","points":44,"price":572289,"role":"BAT","source_name":"Oliver Coombs"},{"baseline":4,"complete_matches":true,"evidence":{"catches":1,"runs":26,"source_rows":["Womens!A9:N9"],"stumpings":0,"wickets":0},"grades":"Womens","matches":9,"name":"Leisha Appleyard","points":36,"price":559146,"role":"BAT","source_name":"Leisha Appleyard"},{"baseline":5.1429,"complete_matches":true,"evidence":{"catches":1,"runs":26,"source_rows":["Womens!A22:N22"],"stumpings":0,"wickets":0},"grades":"Womens","matches":7,"name":"Von Willman","points":36,"price":559146,"role":"BAT","source_name":"Yvonne Willman"},{"baseline":13,"complete_matches":false,"evidence":{"catches":0,"runs":4,"source_rows":["Mens 3rd!A26:N26","Mens 4th!A22:N22"],"stumpings":0,"wickets":3},"grades":"Mens 3rd / Mens 4th","matches":1,"name":"Jack Halliday","points":34,"price":555860,"role":"BOWL","source_name":"Jack Halliday"},{"baseline":2.3077,"complete_matches":true,"evidence":{"catches":2,"runs":0,"source_rows":["Womens!A11:N11"],"stumpings":0,"wickets":1},"grades":"Womens","matches":13,"name":"Chloe-Anne Barry","points":30,"price":549288,"role":"BOWL","source_name":"Chloe-Anne Barry"},{"baseline":26,"complete_matches":true,"evidence":{"catches":0,"runs":26,"source_rows":["U13!A8:N8"],"stumpings":0,"wickets":0},"grades":"U13","matches":1,"name":"Shayaan Abdullah","points":26,"price":542716,"role":"BAT","source_name":"Shayaan Abdullah"},{"baseline":0,"complete_matches":false,"evidence":{"catches":1,"runs":1,"source_rows":["Mens 3rd!A22:N22"],"stumpings":1,"wickets":0},"grades":"Mens 3rd","matches":0,"name":"Scott Evans","points":21,"price":534502,"role":"BAT","source_name":"Scott Evans"},{"baseline":4.2,"complete_matches":true,"evidence":{"catches":0,"runs":1,"source_rows":["Womens!A21:N21"],"stumpings":0,"wickets":2},"grades":"Womens","matches":5,"name":"Jazz Priest","points":21,"price":534502,"role":"BOWL","source_name":"Jasmyn Priest"},{"baseline":0,"complete_matches":false,"evidence":{"catches":1,"runs":4,"source_rows":["Mens 3rd!A14:N14"],"stumpings":0,"wickets":0},"grades":"Mens 3rd","matches":0,"name":"Jackson Brown","points":14,"price":523001,"role":"BAT","source_name":"Jackson Brown"},{"baseline":1.25,"complete_matches":true,"evidence":{"catches":0,"runs":10,"source_rows":["U17!A12:N12"],"stumpings":0,"wickets":0},"grades":"U17","matches":8,"name":"Cohen Felthouse","points":10,"price":516429,"role":"BAT","source_name":"Cohen Felthouse"},{"baseline":1.6,"complete_matches":true,"evidence":{"catches":0,"runs":8,"source_rows":["Womens!A14:N14"],"stumpings":0,"wickets":0},"grades":"Womens","matches":5,"name":"Elysha Fox","points":8,"price":513143,"role":"BAT","source_name":"Elysha Fox"},{"baseline":0,"complete_matches":false,"evidence":{"catches":0,"runs":1,"source_rows":["Mens 3rd!A36:N36"],"stumpings":0,"wickets":0},"grades":"Mens 3rd","matches":0,"name":"James Menzies","points":1,"price":501643,"role":"BAT","source_name":"James Menzies"},{"baseline":0,"complete_matches":true,"evidence":{"catches":0,"runs":0,"source_rows":["Womens!A13:N13"],"stumpings":0,"wickets":0},"grades":"Womens","matches":7,"name":"Grace Elliott","points":0,"price":500000,"role":"UNASSIGNED","source_name":"Grace Elliott"},{"baseline":0,"complete_matches":true,"evidence":{"catches":0,"runs":0,"source_rows":["Womens!A15:N15"],"stumpings":0,"wickets":0},"grades":"Womens","matches":6,"name":"Sammy Harrison","points":0,"price":500000,"role":"UNASSIGNED","source_name":"Sammy Harrison"},{"baseline":0,"complete_matches":true,"evidence":{"catches":0,"runs":0,"source_rows":["Womens!A18:N18"],"stumpings":0,"wickets":0},"grades":"Womens","matches":4,"name":"Emma Jones","points":0,"price":500000,"role":"UNASSIGNED","source_name":"Emma Jones"}]'::jsonb)
 LOOP
  SELECT count(*), (array_agg(id))[1] INTO matches,pid FROM public.fantasy_players
   WHERE lower(regexp_replace(display_name,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(item->>'name','[^a-zA-Z0-9]','','g'));
  IF matches>1 THEN RAISE EXCEPTION 'Ambiguous player identity: %',item->>'name'; END IF;
  IF pid IS NULL THEN
   INSERT INTO public.fantasy_players(display_name,role,team_label,active)
   VALUES(item->>'source_name',item->>'role',item->>'grades',true) RETURNING id INTO pid;
  END IF;
  INSERT INTO public.fantasy_season_players(season_id,player_id,role,team_label,grade_label,active,selectable,source,stats_status,prior_regular_appearances,prior_average_points)
  VALUES(sid,pid,item->>'role',item->>'grades',item->>'grades',true,true,'committee_season_summary','season_summary',(item->>'matches')::integer,(item->>'baseline')::numeric)
  ON CONFLICT(season_id,player_id) DO UPDATE SET
   role=EXCLUDED.role,team_label=EXCLUDED.team_label,grade_label=EXCLUDED.grade_label,
   active=true,selectable=true,source=EXCLUDED.source,stats_status=EXCLUDED.stats_status,
   prior_regular_appearances=EXCLUDED.prior_regular_appearances,prior_average_points=EXCLUDED.prior_average_points,updated_at=stamp;
  INSERT INTO public.fantasy_player_prices(season_id,player_id,effective_round_id,price_dino_dollars,price_million,formula_version,prior_baseline_points,previous_rolling_performance_points,rolling_performance_points,price_change_dino_dollars,source_status,calculation,published_at)
  VALUES(sid,pid,NULL,(item->>'price')::bigint,(item->>'price')::numeric/1000000,'dino-season-summary-v1',
   (item->>'baseline')::numeric,(item->>'baseline')::numeric,(item->>'baseline')::numeric,0,'season_summary',
   item || jsonb_build_object('source_file','20260915-NDCC-2025-2026-Stats-Rev00.xlsx','source_sha256','5227829ea185f6dfbc5bfdfce902efdb2d6b57c5221a7fb24bb14e9066e39697','method','runs + 10*(wickets+catches+stumpings); all-format totals; missing match counts excluded from rolling baseline','best_total',best,'role_method','keeper override; AR if runs>=50,wickets>=3,bowling points share 20-80%; otherwise dominant contribution; zero contributions unclassified'),stamp)
  ON CONFLICT(season_id,player_id,effective_round_id) DO UPDATE SET
   price_dino_dollars=EXCLUDED.price_dino_dollars,price_million=EXCLUDED.price_million,
   formula_version=EXCLUDED.formula_version,prior_baseline_points=EXCLUDED.prior_baseline_points,
   previous_rolling_performance_points=EXCLUDED.previous_rolling_performance_points,
   rolling_performance_points=EXCLUDED.rolling_performance_points,price_change_dino_dollars=0,
   source_status=EXCLUDED.source_status,calculation=EXCLUDED.calculation,published_at=stamp,created_at=stamp;
 END LOOP;
 INSERT INTO public.fantasy_player_prices(season_id,player_id,effective_round_id,price_dino_dollars,price_million,formula_version,prior_baseline_points,previous_rolling_performance_points,rolling_performance_points,price_change_dino_dollars,source_status,calculation,published_at)
 SELECT sid,sp.player_id,NULL,500000,0.5,'dino-season-summary-v1',0,0,0,0,'unrated',
 jsonb_build_object('source_file','20260915-NDCC-2025-2026-Stats-Rev00.xlsx','reason','Player absent from supplied workbook; no claim of zero prior appearances; minimum opening price'),stamp
 FROM public.fantasy_season_players sp WHERE sp.season_id=sid AND sp.active AND sp.selectable AND sp.stats_status='unrated'
 ON CONFLICT(season_id,player_id,effective_round_id) DO UPDATE SET
 price_dino_dollars=500000,price_million=0.5,formula_version=EXCLUDED.formula_version,
 prior_baseline_points=0,previous_rolling_performance_points=0,rolling_performance_points=0,
 price_change_dino_dollars=0,source_status='unrated',calculation=EXCLUDED.calculation,published_at=stamp,created_at=stamp;
 INSERT INTO public.fantasy_price_calculations(season_id,player_id,effective_round_id,formula_version,prior_baseline_points,recent_points,previous_rolling_performance_points,rolling_performance_points,previous_price_dino_dollars,price_change_dino_dollars,new_price_dino_dollars,source_status,evidence,published_at)
 SELECT sid,p.player_id,NULL,p.formula_version,p.prior_baseline_points,ARRAY[]::numeric[],p.previous_rolling_performance_points,p.rolling_performance_points,p.price_dino_dollars,0,p.price_dino_dollars,p.source_status,p.calculation,stamp
 FROM public.fantasy_player_prices p WHERE p.season_id=sid AND p.effective_round_id IS NULL AND p.formula_version='dino-season-summary-v1'
 ON CONFLICT(season_id,player_id,effective_round_id,formula_version) DO NOTHING;
 IF (SELECT max(price_dino_dollars) FROM public.fantasy_player_prices WHERE season_id=sid AND effective_round_id IS NULL)<>2000000 THEN RAISE EXCEPTION 'Top price validation failed'; END IF;
 IF (SELECT count(*) FROM public.fantasy_season_players WHERE season_id=sid AND role='WK' AND active AND selectable)<>5 THEN RAISE EXCEPTION 'Keeper validation failed'; END IF;
 UPDATE public.fantasy_settings SET squad_budget=20,season_name='Dino Coach 2026/2027' WHERE season_id=sid;
END $migration$;

CREATE OR REPLACE FUNCTION public.save_dino_coach_squad(target_manager_id uuid, target_season_id uuid, target_round_id uuid, target_status text, target_budget_dino_dollars bigint, selected_players jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cfg public.fantasy_dino_settings%ROWTYPE;
  target_squad_id UUID;
  expected_players INTEGER;
  actual_budget BIGINT;
  item_count INTEGER;
  invalid_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_manager_id::text || ':' || target_season_id::text,0));
  IF target_status NOT IN ('draft','submitted') OR jsonb_typeof(selected_players) <> 'array' THEN
    RAISE EXCEPTION 'Invalid Dino Coach squad request.' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO cfg FROM public.fantasy_dino_settings WHERE season_id=target_season_id FOR SHARE;
  IF NOT FOUND OR NOT cfg.public_launch_enabled OR NOT cfg.team_selection_open THEN
    RAISE EXCEPTION 'Dino Coach team selection is closed.' USING ERRCODE='check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fantasy_managers m
    JOIN public.fantasy_entries e ON e.manager_id=m.id AND e.season_id=target_season_id AND e.status='paid'
    WHERE m.id=target_manager_id AND m.age_verified_at IS NOT NULL
      AND m.team_name_status IN ('approved','replaced') AND m.rules_version_accepted=cfg.rules_version AND m.is_active
  ) THEN RAISE EXCEPTION 'Dino Coach manager eligibility is incomplete.' USING ERRCODE='check_violation'; END IF;

  SELECT COUNT(*), COUNT(DISTINCT item->>'player_id'), COUNT(DISTINCT item->>'slot_key')
    INTO item_count, invalid_count, expected_players FROM jsonb_array_elements(selected_players) item;
  IF item_count > 15 OR item_count <> invalid_count OR item_count <> expected_players THEN
    RAISE EXCEPTION 'Dino Coach squad contains duplicate players or slots.' USING ERRCODE='check_violation';
  END IF;
  IF target_status='submitted' AND item_count<>15 THEN
    RAISE EXCEPTION 'Every Dino Coach squad slot must be filled.' USING ERRCODE='check_violation';
  END IF;

  WITH supplied AS (
    SELECT item, item->>'slot_key' slot_key, (item->>'player_id')::UUID player_id
    FROM jsonb_array_elements(selected_players) item
  ), valid_slots(slot_key, assigned_role, position_type) AS (VALUES
    ('XI_BAT_1','BAT','starter'),('XI_BAT_2','BAT','starter'),('XI_BAT_3','BAT','starter'),('XI_BAT_4','BAT','starter'),
    ('XI_AR_1','AR','starter'),('XI_AR_2','AR','starter'),('XI_WK_1','WK','starter'),
    ('XI_BOWL_1','BOWL','starter'),('XI_BOWL_2','BOWL','starter'),('XI_BOWL_3','BOWL','starter'),('XI_BOWL_4','BOWL','starter'),
    ('BENCH_BAT_1','BAT','bench'),('BENCH_AR_1','AR','bench'),('BENCH_WK_1','WK','bench'),('BENCH_BOWL_1','BOWL','bench')
  )
  SELECT COUNT(*) INTO invalid_count FROM supplied s
  LEFT JOIN valid_slots v ON v.slot_key=s.slot_key
  LEFT JOIN public.fantasy_season_players sp ON sp.season_id=target_season_id AND sp.player_id=s.player_id AND sp.active AND sp.selectable
  WHERE v.slot_key IS NULL OR sp.player_id IS NULL
    OR s.item->>'assigned_role' IS DISTINCT FROM v.assigned_role OR s.item->>'position_type' IS DISTINCT FROM v.position_type;
  IF invalid_count>0 THEN RAISE EXCEPTION 'Dino Coach squad has an invalid slot or player.' USING ERRCODE='check_violation'; END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(selected_players) item
    WHERE COALESCE((item->>'is_captain')::boolean,false) AND COALESCE((item->>'is_vice_captain')::boolean,false)) THEN
    RAISE EXCEPTION 'Captain and vice-captain must be different players.' USING ERRCODE='check_violation';
  END IF;
  IF target_status='submitted' THEN
    SELECT COUNT(*) INTO invalid_count FROM jsonb_array_elements(selected_players) item
      WHERE COALESCE((item->>'is_captain')::BOOLEAN,FALSE);
    IF invalid_count<>1 THEN RAISE EXCEPTION 'Exactly one captain is required.' USING ERRCODE='check_violation'; END IF;
    SELECT COUNT(*) INTO invalid_count FROM jsonb_array_elements(selected_players) item
      WHERE COALESCE((item->>'is_vice_captain')::BOOLEAN,FALSE);
    IF invalid_count<>1 THEN RAISE EXCEPTION 'Exactly one vice-captain is required.' USING ERRCODE='check_violation'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(selected_players) item
      WHERE (COALESCE((item->>'is_captain')::BOOLEAN,FALSE) OR COALESCE((item->>'is_vice_captain')::BOOLEAN,FALSE))
        AND item->>'position_type'<>'starter') THEN
      RAISE EXCEPTION 'Captain and vice-captain must be in the playing XI.' USING ERRCODE='check_violation';
    END IF;
  END IF;

  WITH chosen AS (SELECT (item->>'player_id')::UUID player_id FROM jsonb_array_elements(selected_players) item),
  latest AS (
    SELECT DISTINCT ON (p.player_id) p.player_id,p.price_dino_dollars
    FROM public.fantasy_player_prices p JOIN chosen c USING(player_id)
    WHERE p.season_id=target_season_id AND p.published_at IS NOT NULL AND p.price_dino_dollars>0
    ORDER BY p.player_id,p.created_at DESC
  ) SELECT COALESCE(SUM(price_dino_dollars),0),COUNT(*) INTO actual_budget,invalid_count FROM latest;
  IF invalid_count<>item_count THEN RAISE EXCEPTION 'Every selected player needs a positive published price.' USING ERRCODE='check_violation'; END IF;
  IF actual_budget>cfg.budget_dino_dollars OR actual_budget<>target_budget_dino_dollars THEN
    RAISE EXCEPTION 'Dino Coach squad budget or price evidence is invalid.' USING ERRCODE='check_violation';
  END IF;

  SELECT id INTO target_squad_id FROM public.fantasy_squads
  WHERE manager_id=target_manager_id AND season_id=target_season_id AND round_id IS NOT DISTINCT FROM target_round_id
  LIMIT 1 FOR UPDATE;
  IF target_squad_id IS NULL THEN
    INSERT INTO public.fantasy_squads(manager_id,season_id,round_id,status,budget_used,budget_used_dino_dollars)
    VALUES(target_manager_id,target_season_id,target_round_id,target_status,actual_budget/1000000.0,actual_budget)
    RETURNING id INTO target_squad_id;
  ELSE
    UPDATE public.fantasy_squads SET status=target_status,budget_used=actual_budget/1000000.0,
      budget_used_dino_dollars=actual_budget,updated_at=NOW() WHERE id=target_squad_id;
    DELETE FROM public.fantasy_squad_players WHERE squad_id=target_squad_id;
  END IF;
  INSERT INTO public.fantasy_squad_players(squad_id,player_id,position_type,bench_order,is_captain,is_vice_captain,slot_key,assigned_role,purchase_price_dino_dollars)
  SELECT target_squad_id,(item->>'player_id')::UUID,item->>'position_type',
    CASE WHEN item->>'position_type'='bench' THEN ROW_NUMBER() OVER (ORDER BY item->>'slot_key')::INTEGER ELSE NULL END,
    COALESCE((item->>'is_captain')::BOOLEAN,FALSE),COALESCE((item->>'is_vice_captain')::BOOLEAN,FALSE),
    item->>'slot_key',item->>'assigned_role',p.price_dino_dollars
  FROM jsonb_array_elements(selected_players) item
  JOIN LATERAL (SELECT price_dino_dollars FROM public.fantasy_player_prices
    WHERE season_id=target_season_id AND player_id=(item->>'player_id')::UUID AND published_at IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) p ON TRUE;
  RETURN target_squad_id;
END; $function$
;
REVOKE ALL ON FUNCTION public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.set_dino_coach_launch_state(target_season_id uuid, launch_enabled boolean, registration_enabled boolean, selection_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE release_ready boolean;
BEGIN
 IF launch_enabled OR registration_enabled OR selection_enabled THEN
  SELECT ready INTO release_ready FROM public.dino_coach_release_readiness(target_season_id);
  IF NOT coalesce(release_ready,false) THEN RAISE EXCEPTION 'Dino Coach release-readiness gate failed.' USING ERRCODE='check_violation'; END IF;
 END IF;
 UPDATE public.fantasy_dino_settings SET public_launch_enabled=launch_enabled,registration_open=registration_enabled,team_selection_open=selection_enabled,updated_at=now() WHERE season_id=target_season_id;
 UPDATE public.fantasy_settings SET is_registration_open=registration_enabled,is_team_selection_open=selection_enabled,updated_at=now() WHERE season_id=target_season_id;
 UPDATE public.fantasy_seasons SET registration_open=registration_enabled,team_selection_open=selection_enabled,updated_at=now() WHERE id=target_season_id;
 RETURN FOUND;
END $function$;
REVOKE ALL ON FUNCTION public.set_dino_coach_launch_state(uuid,boolean,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_dino_coach_launch_state(uuid,boolean,boolean,boolean) TO service_role;
