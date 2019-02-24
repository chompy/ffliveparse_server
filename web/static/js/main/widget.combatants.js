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

var COMBATANT_CONTAINER_ELEMENT_ID = "combatants";
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
        this.streamMode = false;
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
        this.addEventListener("app:combatant", function(e) { t._updateCombatants(e); });
        // window resize
        function _onResize(e) {
            var combatantWidth = t.combatantsElement.offsetWidth;
            for (var i in t.combatants) {
                var element = t.combatants[i]._parseElement;
                var nameElement = element.getElementsByClassName("name")[0];
                nameElement.style.maxWidth = (combatantWidth - 52) + "px"
            }
        }
        this.addEventListener("resize", _onResize);
        setTimeout(function() { _onResize(); }, 1000);
        this.streamMode = (window.location.hash == "#stream");
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
     * @param {Combatant} combatant 
     */
    _updateCombatantElement(combatant)
    {
        var element = combatant._parseElement;
        // assign class for roles
        var jobUpper = combatant.data.Job.toUpperCase();
        var defaultRoleClass = "combatant-dps";
        var roleClasses = {
            "combatant-tank"    : ["WAR", "DRK", "PLD", "GLA", "MRD"],
            "combatant-healer"  : ["SCH", "WHM", "AST", "CNJ"]
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
        if (combatant.data.Job == "Pet") {
            element.classList.add("pet");
        }
        // job icon
        var jobIconElement = element.getElementsByClassName("job-icon")[0];
        var jobIconSrc = "/static/img/job/" + combatant.data.Job.toLowerCase() + ".png";
        if (jobIconSrc != jobIconElement.src) {
            jobIconElement.src = jobIconSrc;
            jobIconElement.title = combatant.data.Job.toUpperCase() + " - " + combatant.getDisplayName();
            jobIconElement.alt = combatant.data.Job.toUpperCase() + " - " + combatant.getDisplayName();
        }
        // name
        var nameElement = element.getElementsByClassName("name")[0];
        if (nameElement.innerText != combatant.getDisplayName()) {
            nameElement.innerText = combatant.getDisplayName();
            element.setAttribute("data-name", combatant.getDisplayName());
            element.title = combatant.getDisplayName();
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
        if (!this.streamMode) {
            this.combatants.sort(function(a, b) {
                if (a.data.ParentID > 0 && b.data.ParentID == 0) {
                    return 1;
                }
                return 0;
            });
        }
        this.combatants.sort(function(a, b) {
            // keep pet with their owner
            if (!t.streamMode && b.data.ParentID) {
                if (a.data.ParentID && a.data.ParentID == b.data.ParentID) {
                    return a.data.Name.localeCompare(b.data.Name);
                }                
                if (!a.compare(b.data.ParentID)) {
                    return 1;
                }
                return 0;
            }

            // sort by user config sort option
            switch (t.userConfig["sortBy"])
            {
                case "healing":
                {
                    return b.data.DamageHealed - a.Data.DamageHealed;
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
                        ["WAR", "DRK", "PLD", "GLA", "MRD"],  // tanks
                        ["SCH", "WHM", "AST", "CNJ"]   // healers
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
                    return b.data.Damage - a.data.Damage;
                }
            }
        });
        for (var i = 0; i < this.combatants.length; i++) {
            this.combatantsElement.appendChild(this.combatants[i]._parseElement);
        }
        // trigger custom event
        window.dispatchEvent(
            new CustomEvent("widget-combatants:display", {"detail" : this.combatants})
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
        if (combatant.data.EncounterUID != this.encounterId) {
            return;
        }
        // must have a job
        if (!combatant.data.Job) {
            return;
        }
        // update existing
        for (var i = 0; i < this.combatants.length; i++) {
            if (
                this.combatants[i].compare(combatant)
            ) {
                this._updateCombatantElement(this.combatants[i]);
                this._displayCombatants();
                return;
            }
        }
        // new combatant
        var combatantElement = this._buildCombatantElement(combatant);
        combatant._parseElement = combatantElement;
        this.combatants.push(combatant);
        // update combatant element
        this._updateCombatantElement(
            this.combatants[this.combatants.length - 1]
        );
        // display
        this._displayCombatants();
    }

}