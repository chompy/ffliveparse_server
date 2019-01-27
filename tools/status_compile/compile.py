import os
import json
import requests
import csv
import re
import time

CSV_FILE = "status.csv"
ICON_URL_FORMAT = "https://xivapi.com/i/%06d/%06d.png"
ICON_PATH = "icons"

if not os.path.exists(ICON_PATH):
    os.mkdir(ICON_PATH)

with open(CSV_FILE, "r") as csvFile:
    csvReader = csv.reader(csvFile)
    index = 0

    output = []
    for row in csvReader:
        index += 1
        if index <= 3: continue

        name = row[1]
        if not name: continue

        details = {
            "name"              : name,
            "description"       : re.sub('<[^<]+?>', '', row[2]),
            "maxStacks"         : row[4],
            "category"          : row[5],
            "hitEffect"         : row[6],
            "vfx"               : row[7],
            "lockMovement"      : True if row[8] == "True" else False,
            "lockActions"       : True if row[10] == "True" else False,
            "lockControl"       : True if row[11] == "True" else False,
            "transfiguration"   : True if row[12] == "True" else False,
            "canDispel"         : True if row[14] == "True" else False,
            "inflictedByActor"  : True if row[15] == "True" else False,
            "isPermanent"       : True if row[16] == "True" else False,
            "isFcBuff"          : True if row[22] == "True" else False,
            "invisibility"      : True if row[23] == "True" else False
        }
                
        
        
        # download icon
        iconId = int(row[3])
        iconIdRange = int(iconId / 1000) * 1000
        iconSavePath = os.path.join(ICON_PATH, "%s.png" % iconId)
        if not os.path.exists(iconSavePath):
            r = requests.get(ICON_URL_FORMAT % (iconIdRange, iconId), stream=True)
            if r.status_code != 200:
                print("error, failed to fetch icon")
                continue
            with open(iconSavePath, 'wb') as f:
                for chunk in r:
                    f.write(chunk)
            time.sleep(1)
        # make icon url path
        details["icon"] = "/%s/%s.png" % (ICON_PATH.strip("/"), iconId)
        output.append(details)

        

    # dump to json file
    with open("status_effects.json", "w") as f:
        json.dump(output, f)