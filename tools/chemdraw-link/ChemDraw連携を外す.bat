@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -Command "$NmrfigSelf='%~f0'; $NmrfigUninstall=$true; . '%~dp0installer.ps1'"
