@echo off
rem Started by dev-db.ps1. Redirect everything to NUL so the detached postgres
rem process does not inherit the caller's pipes (otherwise callers that capture
rem output hang until the server stops).
"%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" -l "%PG_LOG%" -o "-p %PG_PORT%" -w start > NUL 2>&1 < NUL
exit /b %ERRORLEVEL%
