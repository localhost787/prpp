# PRPP dashboard

This is the active Expo / React Native Web application. See [frontend setup, tests and limits](../../README.md) for dependency setup, local export/server commands, browser/PDF prerequisites and attribution.

Synthetic data only. No real server authentication or authorization. English/Spanish visit, results and My care views, a general fictional Services directory under More, and local synthetic PDF downloads are implemented for the web mock. Care categories have separate mock permission guards. Directory distances use an example origin, not GPS; waiting times and plan acceptance remain unknown where undocumented. Family remains pending in the active UI.

The legacy Vite application is two directories above and has a separate dependency tree. Do not confuse its server with this dashboard; both default to port 3001. No native build or production deployment is claimed.
