#!/bin/sh
NOW=$(date +"%F_%H_%M")
./app.bin 2> "/app/data/logging/$NOW.log"