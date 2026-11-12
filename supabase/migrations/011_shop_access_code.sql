-- Migration 011: 6-Digit Unique Shop Access Code
-- Additive and idempotent migration for public.shops table.
-- Generates unique, collision-resistant 6-digit numeric shop codes for customer manual access.

-- 1. Add shop_code column to public.shops if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shops' AND column_name = 'shop_code'
  ) THEN
    ALTER TABLE public.shops ADD COLUMN shop_code VARCHAR(6);
  END IF;
END;
$$;

-- 2. Backfill existing shops with unique 6-digit codes (preserving any existing codes)
DO $$
DECLARE
  rec RECORD;
  new_code VARCHAR(6);
  code_exists BOOLEAN;
  attempts INT;
BEGIN
  -- Canonical default counter shop gets permanent code '100001'
  UPDATE public.shops
  SET shop_code = '100001'
  WHERE (slug = 'printflow-counter' OR id = 'a001a111-0000-0000-0000-000000000001')
    AND (shop_code IS NULL OR shop_code = '');

  -- Backfill any other shops lacking a shop_code
  FOR rec IN SELECT id FROM public.shops WHERE shop_code IS NULL OR shop_code = '' LOOP
    attempts := 0;
    LOOP
      new_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
      SELECT EXISTS(SELECT 1 FROM public.shops WHERE shop_code = new_code) INTO code_exists;
      EXIT WHEN NOT code_exists OR attempts > 200;
      attempts := attempts + 1;
    END LOOP;

    UPDATE public.shops SET shop_code = new_code WHERE id = rec.id;
  END LOOP;
END;
$$;

-- 3. Add UNIQUE constraint to shop_code if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shops_shop_code_key'
  ) THEN
    ALTER TABLE public.shops ADD CONSTRAINT shops_shop_code_key UNIQUE (shop_code);
  END IF;
END;
$$;

-- 4. Create index for fast O(1) customer code lookup
CREATE INDEX IF NOT EXISTS idx_shops_shop_code ON public.shops(shop_code);

-- 5. Auto-assign 6-digit code on future shop inserts if omitted
CREATE OR REPLACE FUNCTION public.assign_shop_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code VARCHAR(6);
  code_exists BOOLEAN;
  attempts INT := 0;
BEGIN
  IF NEW.shop_code IS NULL OR NEW.shop_code = '' THEN
    LOOP
      new_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
      SELECT EXISTS(SELECT 1 FROM public.shops WHERE shop_code = new_code) INTO code_exists;
      EXIT WHEN NOT code_exists OR attempts > 200;
      attempts := attempts + 1;
    END LOOP;
    NEW.shop_code := new_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_shop_code ON public.shops;
CREATE TRIGGER trg_assign_shop_code
BEFORE INSERT ON public.shops
FOR EACH ROW
EXECUTE FUNCTION public.assign_shop_code();
