/*
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
*/

var COMBATANT_ELEMENT_ID = "playerCombatants";

var PARSE_AVAILABLE_COLUMNS = [
    [
        "Job",
        "job",
    ],
    [
        "Name",
        "name"
    ],
    [
        "DPS (%)",
        "damage",
    ],
    [
        "HPS (%)",
        "healing"
    ],
    [
        "Deaths",
        "deaths"
    ]
];

/**
 * Combatants widget
 */
class WidgetCombatants extends WidgetBase
{

    constructor()
    {
        super();
        this.encounterId = null;
        this.encounterDuration = 0;
        this.encounterDamage = 0;
        this.combatants = [];
        this.combatantsElement = document.getElementById(COMBATANT_ELEMENT_ID);
        if (!("sortBy" in this.userConfig)) {
            this.userConfig["sortBy"] = "damage";
            this._saveUserConfig();
        }
    }

    getName()
    {
        return "parse";
    }

    getTitle()
    {
        return "Parse";
    }

    init()
    {
        super.init()
        // reset
        this.reset();
        // hook events
        var t = this;
        this.addEventListener("act:encounter", function(e) { t._updateEncounter(e); });
        this.addEventListener("act:combatant", function(e) { t._updateCombatants(e); });
        this.addEventListener("act:logLine", function(e) { t._onLogLine(e); });
    }

    /**
     * Reset all elements.
     */
    reset()
    {
        this.combatantsElement.innerHTML = "";
        this.combatants = [];
        this.encounterDuration = 0;
        this._displayCombatants();
    }

    /**
     * Build empty combatant element.
     */
    _buildCombatantElement()
    {
        var element = document.createElement("div");
        element.classList.add("combatant");
        element.classList.add("combatant-info");
        // job icon
        var jobIconElement = document.createElement("img");
        jobIconElement.classList.add("job-icon", "loading");
        jobIconElement.onload = function(e) {
            this.classList.remove("loading");
        };
        element.appendChild(jobIconElement);
        // combatant info
        var infoTextElement = document.createElement("div");
        infoTextElement.classList.add("info-text");
        for (var infoSubElementName of ["name", "parse"]) { 
            var infoSubElement = document.createElement("span");
            infoSubElement.classList.add(infoSubElementName);
            infoTextElement.appendChild(infoSubElement);
        }
        element.appendChild(infoTextElement);
        return element;
    }

    /**
     * Update combatant element.
     * @param {array} combatant 
     */
    _updateCombatantElement(combatant)
    {
        var element = combatant.element;
        // assign class for roles
        var jobUpper = combatant.data.Job.toUpperCase();
        var defaultRoleClass = "combatant-dps";
        var roleClasses = {
            "combatant-tank"    : ["WAR", "DRK", "PLD"],
            "combatant-healer"  : ["SCH", "WHM", "AST"]
        };
        var roleClass = defaultRoleClass;
        for (var role in roleClasses) {
            if (roleClasses[role].indexOf(jobUpper) != -1) {
                roleClass = role;
                break;
            }
        }
        if (!element.classList.contains(roleClass)) {
            element.classList.add(roleClass);
        }
        // pet tag
        if (combatant.petOwnerName) {
            element.classList.add("pet");
        }
        // job icon
        var jobIconElement = element.getElementsByClassName("job-icon")[0];
        var jobIconSrc = "/static/img/job/" + combatant.data.Job.toLowerCase() + ".png";
        if (jobIconSrc != jobIconElement.src) {
            jobIconElement.src = jobIconSrc;
            jobIconElement.title = combatant.data.Job.toUpperCase() + " - " + combatant.name;
            jobIconElement.alt = combatant.data.Job.toUpperCase() + " - " + combatant.name;
        }
        // name
        var nameElement = element.getElementsByClassName("name")[0];
        if (nameElement.innerText != combatant.name) {
            nameElement.innerText = combatant.name;
            element.setAttribute("data-name", combatant.name);
            element.title = combatant.name;
        }
        // dps
        var dpsElement = element.getElementsByClassName("parse")[0];
        var dps = (combatant.data.Damage / this.encounterDuration);
        if (!this._isValidParseNumber(dps)) {
            dps = 0;
        }
        dpsElement.innerText = dps.toFixed(2);
    }

    /**
     * Update main combatant container.
     */
    _displayCombatants()
    {
        var t = this;
        // re-sort so all pets are at the bottom
        this.combatants.sort(function(a, b) {
            if (a.petOwnerName != "" && b.petOwnerName == "") {
                return 1;
            } else if (b.petOwnerName != "" && a.petOwnerName == "") {
                return -1;
            }
            return 0;
        });
        this.combatants.sort(function(a, b) {
            // keep pet with their owner
            if (b.petOwnerName) {
                if (b.petOwnerName != a.name) {
                    return 1;
                }
                return 0;
            }
            // sort by user config sort option
            switch (t.userConfig["sortBy"])
            {
                case "healing":
                {
                    var aHps = (a.data.DamageHealed / t.encounterDuration);
                    var bHps = (b.data.DamageHealed / t.encounterDuration);
                    return bHps - aHps;
                }
                case "deaths":
                {
                    return b.data.Deaths - a.data.Deaths;
                }
                case "name":
                {
                    return a.name.localeCompare(b.name);
                }
                case "job":
                {
                    var jobCats = [
                        ["WAR", "DRK", "PLD"],  // tanks
                        ["SCH", "WHM", "AST"]   // healers
                    ];
                    for (var i in jobCats) {
                        var indexA = jobCats[i].indexOf(a.data.Job.toUpperCase());
                        var indexB = jobCats[i].indexOf(b.data.Job.toUpperCase());
                        if (indexA != -1 && indexB == -1) {
                            return -1;
                        } else if (indexA == -1 && indexB != -1) {
                            return 1;
                        }
                    }
                    return a.data.Job.localeCompare(b.data.Job);
                }
                default:
                case "damage":
                {
                    var aDps = (a.data.Damage / t.encounterDuration);
                    var bDps = (b.data.Damage / t.encounterDuration);
                    return bDps - aDps;
                }
            }

        })
        for (var i = 0; i < this.combatants.length; i++) {
            this.combatantsElement.appendChild(this.combatants[i].element);
        }
        // trigger custom event
        window.dispatchEvent(
            new CustomEvent("combatants-display", {"detail" : this.combatants})
        );
    }

    _updateEncounter(event)
    {
        // new encounter
        if (this.encounterId != event.detail.UID) {
            this.reset();
            this.encounterId = event.detail.UID;
        }
        this.encounterDamage = event.detail.Damage;
        // update encounter duration
        this.encounterDuration = (event.detail.EndTime.getTime() - event.detail.StartTime.getTime()) / 1000
        if (!this._isValidParseNumber(this.encounterDuration)) {
            this.encounterDuration = 0;
        }
        // update combatant elements
        for (var i in this.combatants) {
            this._updateCombatantElement(
                this.combatants[i]
            )
        }
        // display combatants
        this._displayCombatants();
    }

    _updateCombatants(event)
    {
        var combatant = event.detail;
        // must be part of same encounter
        if (combatant.EncounterUID != this.encounterId) {
            return;
        }
        // don't add combatants with no job and is not a pet
        if (!combatant.Job.trim() && combatant.Name.indexOf("(") == -1) {
            return;
        }
        // parse out name of pet owner
        var petOwnerName = "";
        if (combatant.Name.indexOf("(") != -1) {
            petOwnerName = combatant.Name.split("(")[1].trim();
            petOwnerName = petOwnerName.substr(0, petOwnerName.length - 1);
            combatant.Job = "pet";
        } else if (combatant.Name == "Demi-Bahamut") {
            combatant.Job = "pet";
            for (var i = 0; i < this.combatants.length; i++) {
                if (this.combatants[i].data.Job == "Smn" && this.combatants[i].data.Name != "Demi-Bahamut") {
                    petOwnerName = this.combatants[i].data.Name;
                    break;
                }
            }
        }

        // update existing
        for (var i = 0; i < this.combatants.length; i++) {
            if (
                this.combatants[i].data.ID == combatant.ID || 
                (this.combatants[i].petOwnerName == petOwnerName && this.combatants[i].data.Name == combatant.Name)
            ) {
                if (this.combatants[i].ids.indexOf(combatant.ID) == -1) {
                    this.combatants[i].ids.push(combatant.ID);
                }
                this.combatants[i].data = combatant;
                this._updateCombatantElement(
                    this.combatants[i]
                );
                this._displayCombatants();
                return;
            }
        }
        // new combatant
        var combatantElement = this._buildCombatantElement(combatant);
        this.combatants.push({
            "ids"           : [combatant.ID],
            "data"          : combatant,
            "element"       : combatantElement,
            "petOwnerName"  : petOwnerName,
            "name"          : "", // name to be set from log data (so sending player name gets set as well instead of "YOU")
        });
        // update combatant element
        this._updateCombatantElement(
            this.combatants[this.combatants.length - 1]
        );
        // display
        this._displayCombatants();
    }

    /**
     * Retrieve character names from "act:logline" event as this
     * will ensure we grab the sending player's actual name instead of "YOU".
     * @param {Event} event 
     */
    _onLogLine(event)
    {
        // check if any combatants need names
        var needName = false;
        for (var i in this.combatants) {
            if (!this.combatants[i].name) {
                needName = true;
                break;
            }
        }
        if (!needName) {
            return;
        }
        // parse log line data to fetch combatant name
        var logLineData = parseLogLine(event.detail.LogLine);
        switch (logLineData.type)
        {
            case MESSAGE_TYPE_SINGLE_TARGET:
            case MESSAGE_TYPE_AOE:
            {
                for (var i in this.combatants) {
                    if (this.combatants[i].name) {
                        continue;
                    }
                    if (this.combatants[i].ids.indexOf(logLineData.sourceId) != -1) {
                        this.combatants[i].name = logLineData.sourceName;
                        this._updateCombatantElement(this.combatants[i]);
                        this._displayCombatants();
                    }
                }
                break;
            }
        }
    }

}