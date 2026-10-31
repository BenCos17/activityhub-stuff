# Flight Sim map proxy

The simulator uses OpenStreetMap tiles through the Discord Activities URL Mapping proxy.

## Discord Developer Portal

In the application settings, open **Activities > URL Mappings** and add:

- Prefix: `/osm`
- Target: `tile.openstreetmap.org`

- Prefix: `/esri`
- Target: `server.arcgisonline.com`

## Client tile path

Both the navigation map and terrain renderer request tiles with:

Street tiles:

`/.proxy/osm/{z}/{x}/{y}.png`

Satellite tiles:

`/.proxy/esri/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`

Attribution shown in the Activity:

Street attribution:

`© OpenStreetMap contributors`

Satellite attribution:

`© Esri, Maxar, Earthstar Geographics, and the GIS User Community`

If tiles fail inside Discord, check the browser Network panel for proxy errors or OSM `403` responses. OSM tile usage must remain within the provider's tile policy.
