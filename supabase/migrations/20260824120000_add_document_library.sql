create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'general' check (category in ('door_type', 'part_type', 'brand', 'general')),
  reference_name text,
  external_url text,
  file_path text,
  file_name text,
  created_at timestamptz not null default now(),
  constraint documents_has_source check (external_url is not null or file_path is not null)
);

alter table public.documents enable row level security;

create policy "Users can view their documents" on public.documents
  for select using (auth.uid() = owner_id);
create policy "Users can create their documents" on public.documents
  for insert with check (auth.uid() = owner_id);
create policy "Users can update their documents" on public.documents
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users can delete their documents" on public.documents
  for delete using (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "Users can read their document files" on storage.objects
  for select using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can upload their document files" on storage.objects
  for insert with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can update their document files" on storage.objects
  for update using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete their document files" on storage.objects
  for delete using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create index if not exists documents_owner_category_idx on public.documents(owner_id, category);
