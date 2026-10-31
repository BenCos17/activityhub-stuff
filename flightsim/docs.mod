# Flight Sim map proxy

The simulator uses OpenStreetMap tiles through the Discord Activities URL Mapping proxy.

## Discord Developer Portal

In the application settings, open **Activities > URL Mappings** and add:

- Prefix: `/osm`
- Target: `tile.openstreetmap.org`

## Client tile path

Both the navigation map and terrain renderer request tiles with:

`/.proxy/osm/{z}/{x}/{y}.png`

Attribution shown in the Activity:

`© OpenStreetMap contributors`

If tiles fail inside Discord, check the browser Network panel for proxy errors or OSM `403` responses. OSM tile usage must remain within the provider's tile policy.
