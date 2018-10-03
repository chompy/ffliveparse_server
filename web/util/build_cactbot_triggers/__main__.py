"""
This file is part of FFLiveParse.

FFLiveParse is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

FFLiveParse is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with FFLiveParse.  If not, see <https://www.gnu.org/licenses/>.
"""

import os
import glob
import json
from jsmin import jsmin

TRIGGER_JS_PATH = os.path.join(os.path.realpath(os.path.dirname(__file__)), "cactbot/ui/raidboss/data/triggers")
DUMP_FILE = os.path.join(os.path.realpath(os.path.dirname(__file__)), "../../static/data/cactbot.triggers.json")

output = {}

os.chdir(TRIGGER_JS_PATH)
for file in glob.glob("*.js"):
    with open(file, "r", encoding="utf8") as f:
        output[file] = jsmin(f.read())

with open(DUMP_FILE, "w") as f:
    json.dump(output, f)