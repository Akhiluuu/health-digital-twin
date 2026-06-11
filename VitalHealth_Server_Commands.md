# VitalHealth Digital Twin Server Operations Cheat Sheet

## Login
ssh ubuntu@151.185.41.234

## Go to Project
cd ~/health-digital-twin
pwd
ls -la

## Service Status
sudo systemctl status digitaltwin
sudo systemctl status healthbot
sudo systemctl status nginx
sudo systemctl status digitaltwin healthbot nginx

## Start Services
sudo systemctl start digitaltwin
sudo systemctl start healthbot
sudo systemctl start nginx

## Stop Services
sudo systemctl stop digitaltwin
sudo systemctl stop healthbot
sudo systemctl stop nginx

## Restart Services
sudo systemctl restart digitaltwin
sudo systemctl restart healthbot
sudo systemctl restart nginx
sudo systemctl restart digitaltwin healthbot

## Enable Auto Start
sudo systemctl enable digitaltwin
sudo systemctl enable healthbot
sudo systemctl enable nginx

## Logs
journalctl -u digitaltwin -f
journalctl -u healthbot -f
journalctl -u nginx -f

## Previous Logs
journalctl -u digitaltwin -n 100
journalctl -u healthbot -n 100

## Health Checks
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost/health
curl http://localhost/ai/health

## Public Checks
curl http://151.185.41.234/health
curl http://151.185.41.234/ai/health

## Update Code
cd ~/health-digital-twin
git status
git pull origin main

## Memory / CPU / Disk
free -h
htop
df -h
uptime

## Ports
sudo ss -tulpn

## Server IP
hostname -I

## Environment File
nano ~/health-digital-twin/.env

## Nginx Config
sudo nano /etc/nginx/sites-available/digitaltwin
sudo nginx -t
sudo systemctl reload nginx

## Model Files
ls -lh ~/health-digital-twin/healthbot/model

## Backup
tar -czf health-digital-twin-backup.tar.gz ~/health-digital-twin

## Ubuntu Updates
sudo apt update
sudo apt upgrade -y

## Reboot
sudo reboot

## Shutdown
sudo shutdown now

## Emergency Recovery
sudo systemctl restart healthbot
journalctl -u healthbot -f

sudo systemctl restart digitaltwin
journalctl -u digitaltwin -f

## Most Used Commands
ssh ubuntu@151.185.41.234
cd ~/health-digital-twin
git pull origin main
sudo systemctl restart digitaltwin healthbot
sudo systemctl status digitaltwin healthbot nginx









If you're using an Expo project but want to generate an APK completely from the terminal without using Expo Go or cloud EAS builds, you can build it locally with Gradle.

From your project root:

npx expo prebuild

This generates the native android/ folder if it doesn't already exist.

Then:

cd android
./gradlew assembleRelease

This creates a release APK locally on your machine.

The APK will be located at:

android/app/build/outputs/apk/release/app-release.apk

To install it directly on a connected Android device:

adb install app/build/outputs/apk/release/app-release.apk





















How It Works in Dev (__DEV__)
You can still override the BioGears URL/key via settings-server screen (navigate directly if needed) — it's just hidden from users 

how to do this and ican i be able to do for biogears and heathbot , give an answer?
