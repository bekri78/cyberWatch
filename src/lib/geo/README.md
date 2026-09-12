Geographic reference snapshot, 2026-09-12

- `cities.json`: GeoNames `cities15000.zip`, https://download.geonames.org/export/dump/ .
  Records: [GeoNames ID, name, ISO country code, latitude, longitude, aliases].
  GeoNames data is licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ .
  Attribution: GeoNames, https://www.geonames.org/ . No warranty of accuracy.
- `countries.json`: world-countries 5.1.0 (already installed by the frontend),
  https://github.com/mledoze/countries , ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/ .
  Contains names, French/English demonyms and country centroids.

The backend resolves explicit title evidence against these local files. It never
accepts coordinates from the language model. Unknown or ambiguous city names
are left unlocated; the city dataset is not exhaustive (cities15000).
These reference coordinates identify a city/country, not a victim's address.
The frontend may offset coincident points for readability.

Regenerate with `node scripts/generate-geo-reference.mjs path/to/cities15000.zip`
from the repository root after installing the frontend dependencies.
