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
 * Parse widget
 */
class WidgetParse extends WidgetBase
{

    constructor()
    {
        super();
        this.encounterId = null;
        this.encounterDuration = 0;
        this.encounterDamage = 0;
        this.combatants = [];
        if (!("showColumns" in this.userConfig)) {
            this.userConfig["showColumns"] = [
                "job", "damage", "healing", "deaths"
            ];
            this._saveUserConfig()
        }
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

    getOptions()
    {
        var options = super.getOptions();
        var t = this;
        options.push(
            new WidgetOption(
                "Configuration",
                "/static/img/opt_config.png",
                function() { t.showOptionConfig(); }
            )
        )
        return options;
    }

    add()
    {
        super.add()
        var bodyElement = this.getBodyElement();
        if (!bodyElement) {
            return;
        }
        // add parse columns
        var parseColumnsElement = document.createElement("div");
        parseColumnsElement.classList.add("parseColumnHeads");
        for (var i in PARSE_AVAILABLE_COLUMNS) {
            var parseColumnElement = document.createElement("div");
            parseColumnElement.classList.add(
                "parseColumn",
                "parseColumn-" + PARSE_AVAILABLE_COLUMNS[i][1],
            );
            parseColumnElement.innerText = PARSE_AVAILABLE_COLUMNS[i][0];
            parseColumnsElement.appendChild(parseColumnElement);
        }
        bodyElement.appendChild(parseColumnsElement);
        // no combatant message
        var noCombatantElement = document.createElement("div");
        noCombatantElement.classList.add("parseNoCombatants", "hide");
        noCombatantElement.innerText = "No combatants";
        bodyElement.appendChild(noCombatantElement);
        // add combatant container
        var combatantsElement = document.createElement("div");
        combatantsElement.classList.add("parseCombatants");
        bodyElement.appendChild(combatantsElement);
        // reset
        this.reset();
        // hook events
        var t = this;
        this.addEventListener("act:encounter", function(e) { t._updateEncounter(e); });
        this.addEventListener("act:combatant", function(e) { t._updateCombatants(e); });
    }

    remove()
    {
        super.remove();
        this.encounterId = null;
        this.encounterDuration = 0;
        this.encounterDamage = 0;
        this.combatants = [];
    }

    showOptionHelp()
    {
        var helpText ="";
        helpText += "--- Parse Widget ---\n";
        helpText += "Displays parses for every allied combatant.";
        alert(helpText);
    }

    /**
     * Reset all elements.
     */
    reset()
    {
        this.getBodyElement().getElementsByClassName("parseCombatants")[0].innerHTML = "";
        this.combatants = [];
        this.encounterDuration = 0;
        this._displayCombatants();
    }

    /**
     * Given column name and combatant get element for value.
     * @param {string} columnName 
     */
    _getColumnElement(columnName)
    {
        var element = document.createElement("div");
        element.classList.add(
            "parseColumn",
            "parseColumn-" + columnName
        );
        switch (columnName)
        {
            case "job":
            {
                element.classList.add("parseCombatantJob");
                var jobIconImageElement = document.createElement("img");
                jobIconImageElement.classList.add("parseCombatantJobImage", "loading");
                element.appendChild(jobIconImageElement);
                jobIconImageElement.addEventListener("load", function(e) {
                    e.target.classList.remove("loading");
                });
                jobIconImageElement.addEventListener("error", function(e) {
                    e.target.src = "/static/img/job/none.png";
                });
                break;
            }
            case "name":
            {
                element.classList.add("parseCombatantName");
                break;
            }
            case "damage":
            {
                element.classList.add("parseCombatantDamage");
                var dpsElement = document.createElement("span");
                dpsElement.classList.add("parseCombatantDps");
                element.appendChild(dpsElement)
                var damagePercentElement = document.createElement("span");
                damagePercentElement.classList.add("parseCombatantDamagePercent");
                element.appendChild(damagePercentElement);
                break;
            }
            case "healing":
            {
                element.classList.add("parseCombatantHealing");
                var hpsElement = document.createElement("span");
                hpsElement.classList.add("parseCombatantHps");
                element.appendChild(hpsElement);
                var healingPercentElement = document.createElement("span");
                healingPercentElement.classList.add("parseCombatantHealingPercent");
                element.appendChild(healingPercentElement);
                break;
            }
            case "deaths":
            {
                element.classList.add("parseCombatantDeaths");
                break;
            }
        }
        return element;
    }

    /**
     * Build empty combatant element.
     */
    _buildCombatantElement()
    {
        var element = document.createElement("div");
        element.classList.add("parseCombatant");
        for (var i in PARSE_AVAILABLE_COLUMNS) {
            element.appendChild(
                this._getColumnElement(PARSE_AVAILABLE_COLUMNS[i][1])
            );
        }
        return element;
    }

    /**
     * Update combatant element.
     * @param {array} combatant 
     * @param {Element} element 
     */
    _updateCombatantElement(combatant, element)
    {
        // calculate percents
        var healingTotal = 0;
        for (var i in this.combatants) {
            healingTotal += this.combatants[i][0].DamageHealed;
        }
        // itterate columns, update values
        for (var i in PARSE_AVAILABLE_COLUMNS) {
            var colElement = element.getElementsByClassName("parseColumn-" + PARSE_AVAILABLE_COLUMNS[i][1])[0];
            if (!colElement) { continue; }
            switch (PARSE_AVAILABLE_COLUMNS[i][1])
            {
                case "job":
                {
                    var jobIconElement = colElement.getElementsByClassName("parseCombatantJobImage")[0];
                    var jobIconSrc = "/static/img/job/" + combatant.Job.toLowerCase() + ".png";
                    if (jobIconSrc != jobIconElement.src) {
                        jobIconElement.src = jobIconSrc;
                        jobIconElement.title = combatant.Job.toUpperCase() + " - " + combatant.Name;
                        jobIconElement.alt = combatant.Job.toUpperCase() + " - " + combatant.Name;
                    }
                    break;
                }
                case "damage":
                {
                    // dps
                    var dpsElement = colElement.getElementsByClassName("parseCombatantDps")[0];
                    var dps = (combatant.Damage / this.encounterDuration);
                    if (!this._isValidParseNumber(dps)) {
                        dps = 0;
                    }
                    dpsElement.innerText = dps.toFixed(2);
                    break;
                }
                case "healing":
                {
                    // hps
                    var hpsElement = colElement.getElementsByClassName("parseCombatantHps")[0];
                    var hps = (combatant.DamageHealed / this.encounterDuration);
                    if (!this._isValidParseNumber(hps)) {
                        hps = 0;
                    }
                    hpsElement.innerText = hps.toFixed(2);
                    // healing percent
                    var healingPercentElement = colElement.getElementsByClassName("parseCombatantHealingPercent")[0];
                    var healingPercent = Math.floor(combatant.DamageHealed * (100 / healingTotal));
                    if (!this._isValidParseNumber(healingPercent)) {
                        healingPercent = 0;
                    }
                    healingPercentElement.innerText = healingPercent + "%";
                    break;
                }
                case "deaths":
                {
                    colElement.innerText = combatant.Deaths;
                    break;
                }
                case "name":
                {
                    colElement.innerText = combatant.Name;
                    break;
                }
            }
        }
    }

    /**
     * Update dps and heal percentage values.
     */
    _updateCombatantPercents()
    {
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
     * Update visiblity of columns based on user config.
     */
    _updateColumnVisiblity()
    {
        var visibleCols = this.userConfig["showColumns"].length;
        for (var i in PARSE_AVAILABLE_COLUMNS) {
            var index = this.userConfig["showColumns"].indexOf(PARSE_AVAILABLE_COLUMNS[i][1]);
            var colElements = this.getBodyElement().getElementsByClassName("parseColumn-" + PARSE_AVAILABLE_COLUMNS[i][1]);
            if (!colElements) {
                continue;
            }
            for (var j = 0; j < colElements.length; j++) {
                if (index != -1) {
                    colElements[j].classList.remove("hide");
                    colElements[j].style.width = ((Math.floor(100 / visibleCols)) - (4) ) + "%";
                    continue;
                }
                colElements[j].classList.add("hide");
            }
        }
    }

    /**
     * Update main combatant container.
     */
    _displayCombatants()
    {
        var combatantContainerElement = this.getBodyElement().getElementsByClassName("parseCombatants")[0];
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
            combatantContainerElement.appendChild(this.combatants[i][1]);
        }
        // show/hide no combatant element
        var noCombatantElement = this.getBodyElement().getElementsByClassName("parseNoCombatants")[0];
        if (this.combatants.length == 0) {
            noCombatantElement.classList.remove("hide");
        } else {
            noCombatantElement.classList.add("hide");
        }
        this._updateColumnVisiblity();
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
        this._updateCombatantPercents();
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

    showOptionConfig()
    {
        var t = this;
        Modal.reset();
        Modal.open(); 
        // parse column selection
        Modal.addSection("Parse Columns");
        for (var i in PARSE_AVAILABLE_COLUMNS) {
            Modal.addCheckbox(
                PARSE_AVAILABLE_COLUMNS[i][1],
                PARSE_AVAILABLE_COLUMNS[i][0],
                this.userConfig["showColumns"].indexOf(PARSE_AVAILABLE_COLUMNS[i][1]) != -1,
                function(name, checked) {
                    var index = t.userConfig["showColumns"].indexOf(name);
                    if (checked && index == -1) {
                        t.userConfig["showColumns"].push(name);
                    } else if (!checked && index != -1) {
                        t.userConfig["showColumns"].splice(index, 1);
                    }
                    t._saveUserConfig();
                    t._updateColumnVisiblity();
                }
            );
        }
        // sort
        Modal.addSection("Sort");

        var choices = {};
        for (var i in PARSE_AVAILABLE_COLUMNS) {
            choices[PARSE_AVAILABLE_COLUMNS[i][1]] = PARSE_AVAILABLE_COLUMNS[i][0];
        }
        Modal.addChoices(
            "sort",
            choices,
            this.userConfig["sortBy"],
            function(name, value) {
                t.userConfig["sortBy"] = value;
                t._saveUserConfig();
                t._displayCombatants();
            }
        );
    }

}