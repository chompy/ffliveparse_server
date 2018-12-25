import os
import json

SKILL_JSON_FILE = "actions_full.json"
ICON_PATH = "icons"
DUMP_KEYS=["name_en", "help_en"]
DATA_DUMP_PATH = "data"

if not os.path.exists(DATA_DUMP_PATH): os.mkdir(DATA_DUMP_PATH)

with open(SKILL_JSON_FILE, "r") as f:
    allSkillData = json.load(f)

newData = {}
for skillId in allSkillData:
    skillData = allSkillData[skillId]
    # find icon in local path
    localIconPath = os.path.join(ICON_PATH, "%s.png" % skillId)
    urlIconPath = "/%s/%s.png" % (ICON_PATH.strip("/"), skillId)
    skillData["icon"] = urlIconPath
    if not os.path.exists(localIconPath):
        skillData["icon"] = None
    # only dump classes whose id are >0
    if skillData.get("classjob") > 0 or skillData.get("classjob_category") > 0:
        # dump full skill data to single data file
        with open(os.path.join(DATA_DUMP_PATH, "%s.json" % skillId), "w") as f:
            json.dump(skillData, f)
        # add smaller subset of to main actions file
        newData[skillId] = {
            "icon" : skillData["icon"]
        }
        for dumpKey in DUMP_KEYS:
            newData[skillId][dumpKey] = skillData.get(dumpKey)

# dump main actions file
with open("actions.json", "w") as f:
    json.dump(newData, f)