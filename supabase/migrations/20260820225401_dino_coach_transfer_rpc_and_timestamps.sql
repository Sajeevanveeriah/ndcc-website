CREATE OR REPLACE FUNCTION set_dino_coach_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_fantasy_dino_settings_updated_at ON fantasy_dino_settings;
CREATE TRIGGER trg_fantasy_dino_settings_updated_at BEFORE UPDATE ON fantasy_dino_settings FOR EACH ROW EXECUTE FUNCTION set_dino_coach_updated_at();
DROP TRIGGER IF EXISTS trg_fantasy_entries_updated_at ON fantasy_entries;
CREATE TRIGGER trg_fantasy_entries_updated_at BEFORE UPDATE ON fantasy_entries FOR EACH ROW EXECUTE FUNCTION set_dino_coach_updated_at();
