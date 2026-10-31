# Flight Sim map tiles

Embedded Discord Activities try the configured URL Mapping proxy first. Top-level browser visits use the provider URLs directly, and embedded clients fall back to those URLs if the proxy is unavailable.

## Client tile URLs

Both the navigation map and terrain renderer use these provider URLs as the direct fallback:

Street tiles:

`https://tile.openstreetmap.org/{z}/{x}/{y}.png`

Satellite tiles:

`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`

Attribution shown in the Activity:

Street attribution:

`© OpenStreetMap contributors`

Satellite attribution:

`© Esri, Maxar, Earthstar Geographics, and the GIS User Community`

If tiles fail, check the browser Network panel for provider errors or OSM `403` responses. OSM tile usage must remain within the provider's tile policy.
