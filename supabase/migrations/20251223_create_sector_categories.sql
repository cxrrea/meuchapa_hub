-- Create sector_categories table
create table if not exists sector_categories (
  id uuid default gen_random_uuid() primary key,
  sector_id uuid not null references sectors(id) on delete cascade,
  category_name text not null,
  created_at timestamp with time zone default now(),
  
  -- Ensure unique category per sector
  unique(sector_id, category_name)
);

-- Add RLS policies
alter table sector_categories enable row level security;

create policy "Anyone can view sector categories"
  on sector_categories for select
  using (true);

create policy "Only admins can manage sector categories"
  on sector_categories for all
  using (
    exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role = 'admin'
    )
  );

-- Create index for faster queries
create index if not exists idx_sector_categories_sector_id 
  on sector_categories(sector_id);
