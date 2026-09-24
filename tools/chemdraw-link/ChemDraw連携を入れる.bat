@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -Command "$NmrfigSelf='%~f0'; . '%~dp0installer.ps1'"
