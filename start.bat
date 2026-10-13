@echo off
rem Starts Drill Planner and opens it in your browser. Close this window to stop it.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, this only happens once...
  call npm install
)
call npm run dev -- --open
