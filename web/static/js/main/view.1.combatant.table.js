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

var COMBATANT_TABLE_AVAILABLE_COLUMNS = [
    [
        "Job",
        "job",
        "Job"
    ],
    [
        "Name",
        "name",
        "Name"
    ],
    [
        "DPS",
        "damage",
        "Damage per second"
    ],
    [
        "HPS",
        "healing",
        "Healing per second"
    ],
    [
        "Hits",
        "hits",
        "Number of offensive actions"
    ],
    [
        "Heals",
        "heals",
        "Number of healing actions"
    ],
    [
        "Kills",
        "kills",
        "Number of enemies killed"
    ],
    [
        "Deaths",
        "deaths",
        "Number of times died"
    ],
    [
        "CDs",
        "cooldowns",
        "Actions on cooldown"
    ]
];


class ViewCombatantTable extends ViewBase
{

    getName()
    {
        return "table";
    }

    getTitle()
    {
        return "Table"
    }

    init()
    {
        super.init();
        if (!("sortBy" in this.userConfig)) {
            this.userConfig["sortBy"] = "damage";
            this.saveUserConfig();
        }
        if (!("columns" in this.userConfig)) {
            this.userConfig["columns"] = ["job", "name", "damage", "healing"];
            this.saveUserConfig();
        }
        this.buildBaseElements();
        this.encounter = null;
        this.combatantElements = {};
        this.cooldownQueue = [];
        this.cooldownTracker = {};
        this.tickTimeout = null;
        this.tick();
    }

    buildBaseElements()
    {
        var element = this.getElement();
        // build options area
        var optionsAreaElement = document.createElement("div");
        optionsAreaElement.classList.add("table-options");
        // build table head
        var tableHead = document.createElement("div");
        tableHead.classList.add("combatant-head");
        for (var i in COMBATANT_TABLE_AVAILABLE_COLUMNS) {
            var tableHeadCol = document.createElement("div");
            tableHeadCol.classList.add(
                "combatant-col",
                "combatant-head-col",
                COMBATANT_TABLE_AVAILABLE_COLUMNS[i][1]
            );
            tableHeadCol.setAttribute("data-sort", COMBATANT_TABLE_AVAILABLE_COLUMNS[i][1]);
            if (this.userConfig["sortBy"] == COMBATANT_TABLE_AVAILABLE_COLUMNS[i][1]) {
                tableHeadCol.classList.add("sort");
            }
            // create sort link
            var tableHeadColLink = document.createElement("a");
            var t = this;
            tableHeadColLink.addEventListener("click", function(e) {
                e.preventDefault();
                var sortElements = t.getElement().getElementsByClassName("sort");
                for (var i = 0; i < sortElements.length; i++) {
                    sortElements[i].classList.remove("sort");
                }
                e.target.parentNode.classList.add("sort");
                t.userConfig["sortBy"] = e.target.parentNode.getAttribute("data-sort");
                t.saveUserConfig();
                t.displayCombatants();
            });
            tableHeadColLink.href = "#";
            tableHeadColLink.innerText = COMBATANT_TABLE_AVAILABLE_COLUMNS[i][0];
            tableHeadCol.appendChild(tableHeadColLink);
            tableHead.appendChild(tableHeadCol)
        }
        element.appendChild(tableHead);
        // build table body
        this.tableBody = document.createElement("div");
        this.tableBody.classList.add("combatant-body");
        element.appendChild(this.tableBody);

        // on checkbox click update column visibility
        var t = this;
        function updateEnabledColumn(e) {
            var column = e.target.getAttribute("data-column");
            if (!column) {
                return;
            }
            if (e.target.checked) {
                t.userConfig["columns"].push(column);
            } else {
                t.userConfig["columns"].splice(
                    t.userConfig["columns"].indexOf(column),
                    1
                );
            }
            t.saveUserConfig();
            t.updateColumnVisibility();
        }
        // create column enable checkboxes
        for (var i in COMBATANT_TABLE_AVAILABLE_COLUMNS) {
            var columnEnableDiv = document.createElement("div");
            columnEnableDiv.classList.add(
                "table-option-column-enable",
                "table-option-column-enable-" + COMBATANT_TABLE_AVAILABLE_COLUMNS[i][1]
            );
            columnEnableDiv.title = COMBATANT_TABLE_AVAILABLE_COLUMNS[i][2];
            var columnEnableCheckbox = document.createElement("input");
            columnEnableCheckbox.type = "checkbox";
            columnEnableCheckbox.setAttribute("id", "table-option-column-enable-" + COMBATANT_TABLE_AVAILABLE_COLUMNS[i][1]);
            columnEnableCheckbox.setAttribute("data-column", COMBATANT_TABLE_AVAILABLE_COLUMNS[i][1]);
            if (this.userConfig["columns"].indexOf(COMBATANT_TABLE_AVAILABLE_COLUMNS[i][1]) != -1) {
                columnEnableCheckbox.checked = true;
            }
            columnEnableCheckbox.addEventListener("click", updateEnabledColumn);
            columnEnableDiv.appendChild(columnEnableCheckbox);
            var columnEnableLabel = document.createElement("label");
            columnEnableLabel.innerText = COMBATANT_TABLE_AVAILABLE_COLUMNS[i][0];
            columnEnableLabel.setAttribute("for", "table-option-column-enable-" + COMBATANT_TABLE_AVAILABLE_COLUMNS[i][1]);
            columnEnableDiv.appendChild(columnEnableLabel);
            optionsAreaElement.appendChild(columnEnableDiv);
        }
        element.appendChild(optionsAreaElement);
        this.updateColumnVisibility();
    }

    buildCombatantElement()
    {
        var tableRow = document.createElement("div");
        tableRow.classList.add("combatant-row");
        for (var i in COMBATANT_TABLE_AVAILABLE_COLUMNS) {
            var tableCol = document.createElement("div");
            tableCol.classList.add(
                "combatant-col",
                COMBATANT_TABLE_AVAILABLE_COLUMNS[i][1]
            );
            tableCol.innerText = "-";
            tableRow.appendChild(tableCol);
        }
        return tableRow;        
    }

    updateCombatantElement(combatant, element)
    {
        // set role class
        var roleClass = combatant.getRole();
        if (!element.classList.contains(roleClass)) {
            element.classList.add(roleClass);
        }
        // update columns
        var colElements = element.getElementsByClassName("combatant-col");
        for (var i = 0; i < colElements.length; i++) {
            var colElement = colElements[i];
            var colName = "";
            for (var j in COMBATANT_TABLE_AVAILABLE_COLUMNS) {
                if (colElement.classList.contains(COMBATANT_TABLE_AVAILABLE_COLUMNS[j][1])) {
                    colName = COMBATANT_TABLE_AVAILABLE_COLUMNS[j][1];
                    break;
                }
            }
            switch(colName) {
                case "job":
                {
                    var value = combatant.getTableCol(colName);
                    var storedJob = colElement.getAttribute("data-job");
                    if (storedJob != value && value) {
                        colElement.innerHTML = "";
                        var imageElement = document.createElement("img");
                        imageElement.src = "/static/img/job/" + value + ".png";
                        imageElement.alt = "Job '" + value.toUpperCase() + "'";
                        imageElement.title = value.toUpperCase();
                        colElement.appendChild(imageElement);
                    }
                    break;
                }
                case "damage":
                {
                    var value = this.combatantCollector.getCombatantTotalDamage(combatant);
                    var storedDamage = colElement.getAttribute("data-damage")
                    if (value == storedDamage) {
                        break;
                    }
                    colElement.setAttribute("data-damage", value);
                    if (this.encounter) {
                        var dps = value / (this.encounter.getLength() / 1000);
                        colElement.innerText = dps.toFixed(2);
                        colElement.title = dps.toFixed(2) + " damage per second (" + value + " total damage)";
                    }
                    break;
                }
                case "healing":
                {
                    var value = this.combatantCollector.getCombatantTotalHealing(combatant);
                    var storedHealing = colElement.getAttribute("data-healing")
                    if (value == storedHealing) {
                        break;
                    }
                    colElement.setAttribute("data-healing", value);
                    if (this.encounter) {
                        var hps = value / (this.encounter.getLength() / 1000);
                        colElement.innerText = hps.toFixed(2);
                        colElement.title = hps.toFixed(2) + " healing per second (" + value + " total healing)";
                    }
                    break;
                }
                case "cooldowns":
                {
                    colElement.innerHTML = "";
                    var cooldowns = [];
                    for (var j in this.cooldownTracker) {
                        var cooldownData = this.cooldownTracker[j];
                        if (cooldownData.combatant.compare(combatant)) {
                            cooldowns.push(cooldownData);
                        }
                    }
                    cooldowns.sort(function(a, b){
                        return a.remaining > b.remaining;
                    });
                    for (var j in cooldowns) {
                        colElement.appendChild(cooldowns[j].element);
                    }
                    if (colElement.innerHTML == "") {
                        colElement.innerHTML = "-";
                    }
                    break;
                }

                default:
                {
                    var value = combatant.getTableCol(colName);
                    if (colElement.innerText != value) {
                        colElement.innerText = value;
                    }
                    break;
                }
            }
        }
    }

    displayCombatants()
    {
        // only display when active
        if (!this.active) {
            return;
        }
        // make combatant list
        var combatants = this.combatantCollector.getSortedCombatants(this.userConfig["sortBy"]);
        this.tableBody.innerHTML = "";
        // display elements
        for (var i in combatants) {
            if (typeof(this.combatantElements[combatants[i].getLastSnapshot().Name]) == "undefined") {
                continue;
            }
            var element = this.combatantElements[combatants[i].getLastSnapshot().Name];
            this.tableBody.appendChild(element);
        }
        this.updateColumnVisibility();
    }

    updateColumnVisibility()
    {
        var element = this.getElement();
        // hide all
        var tableCells = element.getElementsByClassName("combatant-col");
        for (var i = 0; i < tableCells.length; i++) {
            tableCells[i].classList.add("col-hide");
        }
        // unhide enabled columns        
        for (var i in this.userConfig["columns"]) {
            var columnName = this.userConfig["columns"][i];
            for (var j = 0; j < tableCells.length; j++) {
                if (tableCells[j].classList.contains(columnName)) {
                    tableCells[j].classList.remove("col-hide");
                }
            }
        }
        this.updateColumnWidths();
    }

    updateColumnWidths()
    {
        var element = this.getElement();
        var totalWidth = 0;
        
        for (var i in this.userConfig["columns"]) {
            var columnName = this.userConfig["columns"][i];
            var minColWidth = 64;
            for (var combatantName in this.combatantElements) {
                var combatantElement = this.combatantElements[combatantName];
                var colElement = combatantElement.getElementsByClassName(columnName)[0];
                colElement.style.width = "";
                var colWidth = colElement.offsetWidth;
                if (colWidth && colWidth > minColWidth) {
                    minColWidth = colWidth;
                }
            }
            var colElements = element.getElementsByClassName(columnName);
            for (var j = 0; j < colElements.length; j++) {
                colElements[j].style.width = minColWidth + "px";
            }
            if (minColWidth > 0) {
                totalWidth += minColWidth;
            }
        }
        var offset = 30 + (this.userConfig["columns"].length * 20);
        var viewportWidth = window.innerWidth;
        
        if (totalWidth < viewportWidth - offset) {
            totalWidth = viewportWidth - offset;
        }
        for (var i = 0; i < element.children.length; i++) {
            element.children[i].style.width = (totalWidth + offset - (i == 0 ? 30 : 0)) + "px";
        }
    }

    processCooldownQueue()
    {
        if (!this.actionData) {
            return;
        }
        // itterate actions in queue
        var action = null;
        while (action = this.cooldownQueue.shift()) {
            // must have action id and source combatant
            if (action.data.actionId == 0 || !action.sourceCombatant) {
                continue;
            }
            // fetch action data
            var actionData = this.actionData.getActionById(action.data.actionId);
            if (!actionData || actionData.cooldown < 10) {
                continue;
            }
            // build element if not built already
            var cdtKey = action.data.sourceId + "-" + action.data.actionId;
            if (!(cdtKey in this.cooldownTracker)) {
                var cdElement = document.createElement("div");
                cdElement.classList.add("table-cooldown", "table-cooldown-" + cdtKey);
                cdElement.setAttribute("data-action-id", action.data.actionId);
                var cdElementIcon = document.createElement("img");
                cdElementIcon.src = ACTION_DATA_BASE_URL + actionData.icon;
                cdElementIcon.alt = action.data.actionName;
                cdElementIcon.title = action.data.actionName;
                cdElement.appendChild(cdElementIcon);
                var cdElementTime = document.createElement("span");
                cdElementTime.classList.add("table-cooldown-time");
                cdElementTime.innerText = "---";
                cdElement.appendChild(cdElementTime);
                this.cooldownTracker[cdtKey] = {
                    "combatant" : action.sourceCombatant,
                    "actionData" : actionData,
                    "element" : cdElement,
                    "remaining" : 999
                };
            }
            // update
            this.cooldownTracker[cdtKey]["time"] = action.time;
            this.cooldownTracker[cdtKey]["element"].classList.remove("hide", "blink");
        }
    }

    updateCooldowns()
    {
        for (var j in this.cooldownTracker) {
            var cooldownData = this.cooldownTracker[j];
            var cooldownTime = new Date() - cooldownData.time;
            if (!cooldownTime || cooldownTime > cooldownData.actionData.cooldown * 1000) {
                cooldownData.element.classList.add("hide");
                continue;
            }
            // format cooldown time remaining
            var cdTimeRemaining = parseInt(cooldownData.actionData.cooldown - (cooldownTime / 1000));
            if (cdTimeRemaining > 999) {
                cdTimeRemaining = 999;
            }
            if (cdTimeRemaining < 0) {
                cdTimeRemaining = 0;
            }
            cooldownData.remaining = cdTimeRemaining;
            if (cdTimeRemaining < 10) {
                cdTimeRemaining = "00" + cdTimeRemaining
                cooldownData.element.classList.add("blink");
            } else if (cdTimeRemaining < 100) {
                cdTimeRemaining = "0" + cdTimeRemaining;
            }
            cooldownData.element.getElementsByClassName("table-cooldown-time")[0].innerText = cdTimeRemaining;
        }
        this.updateColumnWidths();
    }

    tick()
    {
        if (this.tickTimeout) {
            clearTimeout(this.tickTimeout);
        }
        this.processCooldownQueue();
        this.updateCooldowns();
        var t = this;
        this.tickTimeout = setTimeout(
            function() { t.tick(); },
            1000
        );
    }


    onEncounter(encounter)
    {
        this.tableBody.innerHTML = "";
        this.combatantElements = {};
        this.encounter = encounter;
        this.cooldownTracker = {};
        this.cooldownQueue = [];
    }

    onCombatant(combatant)
    {
        if (!combatant.getLastSnapshot().Job) {
            return;
        }
        if (typeof(this.combatantElements[combatant.getLastSnapshot().Name]) == "undefined") {
            this.combatantElements[combatant.getLastSnapshot().Name] = this.buildCombatantElement();
        }
        this.updateCombatantElement(combatant, this.combatantElements[combatant.getLastSnapshot().Name]);
        this.displayCombatants();
    }

    onAction(action)
    {
        this.cooldownQueue.push(action);
    }

    onActive()
    {
        super.onActive();
        this.displayCombatants();
    }

    onResize()
    {
        this.updateColumnWidths();
    }

}