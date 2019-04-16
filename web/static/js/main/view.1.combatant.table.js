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
    ],
    [
        "Name",
        "name"
    ],
    [
        "DPS",
        "damage",
    ],
    [
        "HPS",
        "healing"
    ],
    [
        "Deaths",
        "deaths"
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
        this.buildBaseElements();
        this.encounter = null;
        this.combatantElements = {};
        if (!("sortBy" in this.userConfig)) {
            this.userConfig["sortBy"] = "damage";
            this.saveUserConfig();
        }
    }

    buildBaseElements()
    {
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
        this.getElement().appendChild(tableHead);
        // build table body
        this.tableBody = document.createElement("div");
        this.tableBody.classList.add("combatant-body");
        this.getElement().appendChild(this.tableBody);
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
        var defaultRoleClass = "dps";
        var roleClasses = {
            "tank"    : ["WAR", "DRK", "PLD", "GLA", "MRD"],
            "healer"  : ["SCH", "WHM", "AST", "CNJ"],
            "pet"     : ["PET"],
        };
        var roleClass = defaultRoleClass;
        for (var role in roleClasses) {
            if (roleClasses[role].indexOf(combatant.data.Job.toUpperCase()) != -1) {
                roleClass = role;
                break;
            }
        }
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
        var combatants = [];
        for (var i in this.combatantCollector.combatants) {
            combatants.push(this.combatantCollector.combatants[i]);
        }
        // sort combatant list
        var t = this;
        // re-sort so all pets are at the bottom
        combatants.sort(function(a, b) {
            if (a.data.ParentID > 0 && b.data.ParentID == 0) {
                return 1;
            }
            return 0;
        });
        combatants.sort(function(a, b) {
            // keep pet with their owner
            if (b.data.ParentID) {
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
                    return t.combatantCollector.getCombatantTotalHealing(b) - t.combatantCollector.getCombatantTotalHealing(a);
                }
                case "deaths":
                {
                    return b.data.Deaths - a.data.Deaths;
                }
                case "name":
                {
                    return a.data.Name.localeCompare(b.data.Name);
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
                    return t.combatantCollector.getCombatantTotalDamage(b) - t.combatantCollector.getCombatantTotalDamage(a);
                }
            }
        });
        // display elements
        for (var i in combatants) {
            var element = this.combatantElements[combatants[i].data.Name];
            this.tableBody.appendChild(element);
        }
    }

    onEncounter(encounter)
    {
        this.tableBody.innerHTML = "";
        this.combatantElements = {};
        this.encounter = encounter;
    }

    onCombatant(combatant)
    {
        if (!combatant.data.Job) {
            return;
        }
        var isNew = false;
        if (typeof(this.combatantElements[combatant.data.Name]) == "undefined") {
            this.combatantElements[combatant.data.Name] = this.buildCombatantElement();
            isNew = true;
        }
        this.updateCombatantElement(combatant, this.combatantElements[combatant.data.Name]);
        // update parent combatant
        if (combatant.data.ParentID) {
            var parentCombatant = this.combatantCollector.find(combatant.data.ParentID);
            if (parentCombatant) {
                this.updateCombatantElement(parentCombatant, this.combatantElements[parentCombatant.data.Name]);
            }
        }
        this.displayCombatants();
        if (isNew) {
            // TODO find a way to make this automatic?
            fflpFixFooter();
        }
    }

    onActive()
    {
        super.onActive();
        this.displayCombatants();
    }

}