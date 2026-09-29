-- NULL = never chosen: the app follows the browser language until the user saves one.
-- Stored 'id' values were only ever the old column default, so they reset to NULL too.
ALTER TABLE public.profiles
  ALTER COLUMN language_preference DROP NOT NULL,
  ALTER COLUMN language_preference DROP DEFAULT;

UPDATE public.profiles SET language_preference = NULL WHERE language_preference = 'id';
