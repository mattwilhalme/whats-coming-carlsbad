insert into public.sources (slug, name, canonical_url, owner_name, update_cadence) values
  ('ceqanet', 'CEQAnet', 'https://ceqanet.lci.ca.gov/', 'California Governor''s Office of Land Use and Climate Innovation', 'event-based'),
  ('carlsbad-planning', 'Carlsbad planning notices', 'https://www.carlsbadca.gov/departments/community-development/planning/agendas-minutes-notices', 'City of Carlsbad', 'weekly'),
  ('salt-grass-developer', 'Salt | Grass developer page', 'https://www.blvd-beach.com/', 'Boulevard Partners', 'unknown')
on conflict (slug) do nothing;

insert into public.projects (slug, name, category, location_text, proposed_units, affordable_units, commercial_sqft, current_status, status_as_of, source_id, source_label, source_url)
select v.slug, v.name, v.category, v.location_text, v.proposed_units, v.affordable_units, v.commercial_sqft, v.current_status, v.status_as_of::date, s.id, v.source_label, v.source_url
from (values
  ('fairfield-apartments-bressi-ranch','Fairfield Apartments at Bressi Ranch','apartments','Palomar Airport Road & Gateway Road',320,43,null,'CEQA exemption posted','2026-10-09','ceqanet','CEQAnet','https://ceqanet.lci.ca.gov/2026100315'),
  ('salk-avenue-apartments','Salk Avenue Apartments','apartments','Salk Avenue / College Boulevard / El Camino Real',397,59,null,'Planning approval documented','2026-06-03','ceqanet','CEQAnet','https://ceqanet.lci.ca.gov/2026030432/3'),
  ('resort-view-apartments','Resort View Apartments','apartments','Viejo Castilla Way between Navarra Drive and Pirineos Way',26,null,null,'Planning approval documented','2026-01-21','ceqanet','CEQAnet','https://ceqanet.lci.ca.gov/2026010839'),
  ('salt-grass','Salt | Grass','mixed-use','2715–2729 Carlsbad Boulevard',15,2,8240,'Developer-stated application','2026-07-10','salt-grass-developer','Developer page','https://www.blvd-beach.com/'),
  ('next-med-center-sign-program','Next Med Center sign program','commercial','Carlsbad, California',null,null,null,'Source needs manual verification','2026-09-10','carlsbad-planning','City notice index','https://www.carlsbadca.gov/departments/community-development/planning/agendas-minutes-notices'),
  ('costco-fuel-expansion','Costco fuel expansion','commercial','Address not yet verified',null,null,null,'Source needs manual verification','2025-10-14','carlsbad-planning','City notice index','https://www.carlsbadca.gov/departments/community-development/planning/agendas-minutes-notices')
) as v(slug,name,category,location_text,proposed_units,affordable_units,commercial_sqft,current_status,status_as_of,source_slug,source_label,source_url)
join public.sources s on s.slug = v.source_slug
on conflict (slug) do update set
  name=excluded.name, location_text=excluded.location_text, proposed_units=excluded.proposed_units,
  affordable_units=excluded.affordable_units, commercial_sqft=excluded.commercial_sqft,
  current_status=excluded.current_status, status_as_of=excluded.status_as_of,
  source_id=excluded.source_id, source_label=excluded.source_label, source_url=excluded.source_url,
  updated_at=now();
