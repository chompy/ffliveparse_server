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
        jobIconElement.classList.add("job-icon");
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
     * @param {Element} element 
     */
    _updateCombatantElement(combatant, element)
    {
        // assign class for roles
        var jobUpper = combatant.Job.toUpperCase();
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
        // job icon
        var jobIconElement = element.getElementsByClassName("job-icon")[0];
        var jobIconSrc = "/static/img/job/" + combatant.Job.toLowerCase() + ".png";
        if (jobIconSrc != jobIconElement.src) {
            jobIconElement.src = jobIconSrc;
            jobIconElement.title = combatant.Job.toUpperCase() + " - " + combatant.Name;
            jobIconElement.alt = combatant.Job.toUpperCase() + " - " + combatant.Name;
        }
        // name
        var nameElement = element.getElementsByClassName("name")[0];
        if (nameElement.innerText != combatant.Name) {
            nameElement.innerText = combatant.Name;
            element.setAttribute("data-name", combatant.Name);
            element.title = combatant.Name;
        }
        // dps
        var dpsElement = element.getElementsByClassName("parse")[0];
        var dps = (combatant.Damage / this.encounterDuration);
        if (!this._isValidParseNumber(dps)) {
            dps = 0;
        }
        dpsElement.innerText = dps.toFixed(2);
    }

    /**
     * Update dps and heal percentage values.
     */
    _updateCombatantPercents()
    {
        return;
        // TODO
        // calculate healing total
        var healingTotal = 0;
        for (var i in this.combatants) {
            healingTotal += this.combatants[i][0].DamageHealed;
        }
        // update percents for each combatant
        for (var i in this.combatants) {
            var combatant = this.combatants[i][0];
            var element = this.combatants[i][1];
            // damage percent
            var damagePercentElement = element.getElementsByClassName("parseCombatantDamagePercent")[0];
            var healingPercentElement = element.getElementsByClassName("parseCombatantHealingPercent")[0];
            var damagePercent = Math.floor(combatant.Damage * (100 / this.encounterDamage));
            if (!this._isValidParseNumber(damagePercent)) {
                damagePercent = 0;
            }
            damagePercentElement.innerText = damagePercent + "%";
            // healing percent
            var healingPercentElement = element.getElementsByClassName("parseCombatantHealingPercent")[0];
            var healingPercent = Math.floor(combatant.DamageHealed * (100 / healingTotal));
            if (!this._isValidParseNumber(healingPercent)) {
                healingPercent = 0;
            }
            healingPercentElement.innerText = healingPercent + "%";
        }
    }

    /**
     * Update main combatant container.
     */
    _displayCombatants()
    {
        var t = this;
        this.combatants.sort(function(a, b) {
            switch (t.userConfig["sortBy"])
            {
                case "healing":
                {
                    var aHps = (a[0].DamageHealed / t.encounterDuration);
                    var bHps = (b[0].DamageHealed / t.encounterDuration);
                    return bHps - aHps;
                }
                case "deaths":
                {
                    return b[0].Deaths - a[0].Deaths;
                }
                case "name":
                {
                    return a[0].Name.localeCompare(b[0].Name);
                }
                case "job":
                {
                    var jobCats = [
                        ["WAR", "DRK", "PLD"],  // tanks
                        ["SCH", "WHM", "AST"]   // healers
                    ];
                    for (var i in jobCats) {
                        var indexA = jobCats[i].indexOf(a[0].Job.toUpperCase());
                        var indexB = jobCats[i].indexOf(b[0].Job.toUpperCase());
                        if (indexA != -1 && indexB == -1) {
                            return -1;
                        } else if (indexA == -1 && indexB != -1) {
                            return 1;
                        }
                    }
                    return a[0].Job.localeCompare(b[0].Job);
                }
                default:
                case "damage":
                {
                    var aDps = (a[0].Damage / t.encounterDuration);
                    var bDps = (b[0].Damage / t.encounterDuration);
                    return bDps - aDps;
                }
            }

        })
        for (var i = 0; i < this.combatants.length; i++) {
            this.combatantsElement.appendChild(this.combatants[i][1]);
        }
        // trigger custom event
        window.dispatchEvent(
            new CustomEvent("combatants-display", {"detail" : this.combatants})
        );
    }

    _updateEncounter(event)
    {
        // new encounter
        if (this.encounterId != event.detail.ID) {
            this.reset();
            this.encounterId = event.detail.ID;
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
                this.combatants[i][0],
                this.combatants[i][1],
                this.encounterDuration
            )
        }
        // display combatants
        this._displayCombatants();
        //this._updateCombatantPercents();
    }

    _updateCombatants(event)
    {
        var combatant = event.detail;
        // must be part of same encounter
        if (combatant.EncounterID != this.encounterId) {
            return;
        }
        // don't add combatants with no job
        if (!combatant.Job.trim()) {
            return;
        }
        // update existing
        for (var i = 0; i < this.combatants.length; i++) {
            if (this.combatants[i][0].Name == combatant.Name) {
                this.combatants[i][0] = combatant;
                this._updateCombatantElement(
                    combatant,
                    this.combatants[i][1],
                    this.encounterDuration
                );
                this._displayCombatants();
                return;
            }
        }
        // new combatant
        var combatantElement = this._buildCombatantElement(combatant);
        this.combatants.push([
            combatant,
            combatantElement
        ]);
        // update combatant element
        this._updateCombatantElement(
            combatant,
            combatantElement,
            this.encounterDuration
        );
        // display
        this._displayCombatants();
        this._updateCombatantPercents();
    }

}