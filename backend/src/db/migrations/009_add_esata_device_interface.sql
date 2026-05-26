DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_interface') THEN
    BEGIN
      ALTER TYPE device_interface ADD VALUE IF NOT EXISTS 'eSATA';
    EXCEPTION WHEN duplicate_object THEN
      -- already exists
      NULL;
    END;
  END IF;
END$$;
