ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS website_url TEXT;
