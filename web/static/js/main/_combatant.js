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

var combatantDefaultRoleClass = "dps";
var combatantRoleClasses = {
    "tank"    : ["WAR", "DRK", "PLD", "GLA", "MRD", "GNB"],
    "healer"  : ["SCH", "WHM", "AST", "CNJ"],
    "pet"     : ["PET"],
    "enemy"   : ["ENEMY"],
    "special" : ["LB"],
};

/**
 * Collects all combatants.
 */
class CombatantCollector
{

    constructor()
    {
        this.reset();
    }

    reset()
    {
        this.combatants = [];
    }

    /**
     * Add or update combatant.
     * @param {object} data 
     * @return {Combatant|null}
     */
    update(data)
    {
        // must have a name
        if (typeof(data.Name) == "undefined" || !data.Name) {
            return null;
        }
        // update
        var combatant = this.find(data);
        if (combatant) {
            combatant.update(data);
            return combatant;
        }
        // new
        combatant = new Combatant();
        combatant.update(data);
        this.combatants.push(combatant);
        return combatant;
    }

    /**
     * Find combatant.
     * @param {mixed} data 
     * @return {Combatant|null}
     */
    find(data)
    {
        for (var i in this.combatants) {
            if (this.combatants[i].compare(data)) {
                return this.combatants[i];
            }
        }
        return null;
    }

    /**
     * Get total damage for combatant.
     * @param {Combatant} combatant 
     * @return float
     */
    getCombatantTotalDamage(combatant)
    {
        var value = combatant.getLastSnapshot().Damage;
        if (!this._isValidParseNumber(value)) {
            value = 0;
        }
        return value;  
    }

    /**
     * Get total healing for combatant, combining all child combatants.
     * @param {Combatant} combatant 
     * @return float
     */    
    getCombatantTotalHealing(combatant)
    {
        var value = combatant.getLastSnapshot().DamageHealed;
        if (!this._isValidParseNumber(value)) {
            value = 0;
        }
        return value;        
    }

    /**
     * Check that number is valid number for parsing.
     * I.e. a real number that is a non negative
     * @param {numeric} value 
     */
    _isValidParseNumber(value)
    {
        return (
            !isNaN(value) &&
            isFinite(value) &&
            value >= 0
        );
    }

    /**
     * Get sorted list of combatants.
     * @param {string} sort 
     * @return {array}
     */
    getSortedCombatants(sort)
    {
        // make combatant list
        var combatants = [];
        for (var i in this.combatants) {
            combatants.push(this.combatants[i]);
        }
        // sort combatant list
        var t = this;
        var sort = sort;
        combatants.sort(function(a, b) {
            // sort by user config sort option
            switch (sort)
            {
                case "healing":
                {
                    return t.getCombatantTotalHealing(b) - t.getCombatantTotalHealing(a);
                }
                case "deaths":
                {
                    return b.getLastSnapshot().Deaths - a.getLastSnapshot().Deaths;
                }
                case "name":
                {
                    return a.data.Name.localeCompare(b.data.Name);
                }
                case "job":
                case "role":
                {
                    var jobCats = [
                        ["WAR", "DRK", "PLD", "GLA", "MRD", "GNB"],  // tanks
                        ["SCH", "WHM", "AST", "CNJ"]   // healers
                    ];
                    if (b.data.Job.toUpperCase() == "LB") {
                        return -1;
                    }
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
                case "hits":
                {
                    return a.data.Hits > b.data.Hits;
                }
                case "heals":
                {
                    return a.data.Heals > b.data.Heals;
                }
                default:
                case "damage":
                {
                    return t.getCombatantTotalDamage(b) - t.getCombatantTotalDamage(a);
                }
            }
        });
        return combatants;
    }

}

/**
 * Store information about a combatant.
 */
class Combatant
{

    constructor()
    {
        this.data = null;
        this.ids = [];
        this.names = [];
    }

    /**
     * Update combatant data with ACT data object.
     * @param {object} data 
     */
    update(data)
    {
        if (!this.data || !this.data.Job) {
            this.data = data;
        } else if (this.data) {
            for (var i in data.Snapshots) {
                this.data.Snapshots.push(data.Snapshots[i]);
            }
        }
        if (this.ids.indexOf(data.ID) == -1) {
            this.ids.push(data.ID);
        }
        if (this.names.indexOf(data.Name) == -1) {
            this.names.push(data.Name);
        }
    }

    /**
     * Get data snapshot closest to given time
     * @param Date time
     * @return {object} 
     */
    getSnapshot(time)
    {
        var bestIndex = 0;
        var bestDiff = 99999;
        if (time) {
            for (var i in this.data.Snapshots) {
                var diff = time.getTime() - this.data.Snapshots[i].Time.getTime();
                if (diff < 0) {
                    continue;
                }
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestIndex = i;
                }
            }
        }
        var data = {};
        Object.assign(data, this.data, this.data.Snapshots[bestIndex]);
        delete data.Snapshots;
        return data;
    }

    /**
     * Get last data snapshot. (Should reflect final results of encounter.)
     * @return {object}
     */
    getLastSnapshot()
    {
        if (!this.data) {
            return null;
        }
        var data = {};
        Object.assign(data, this.data, this.data.Snapshots[this.data.Snapshots.length - 1]);
        delete data.Snapshots;
        return data;
    }

    /**
     * Determine if given value matches/represents this combatant.
     * @param {object|string|integer} value
     * @return boolean
     */
    compare(value)
    {
        if (!value) {
            return false;
        }
        if (typeof(value.data) != "undefined") {
            value = value.data;
            if (typeof(value[0]) != "undefined") {
                value = value[0];
            }
        }
        return (
            // compare act object
            (
                typeof(value) == "object" &&
                (
                    this.ids.indexOf(value.ID) != -1 ||
                    (
                        this.data.ParentID != 0 &&
                        this.data.ParentID == value.ParentID &&
                        this.names.indexOf(value.Name) != -1
                    )
                )
            // compare id or name
            ) ||
            (
                ["string", "number"].indexOf(typeof(value)) != -1 &&
                (
                    this.ids.indexOf(value) != -1 ||
                    this.names.indexOf(value) != -1
                )
            )
        );
    }

    /** 
     * Get combatant display name.
     * @return string
     */
    getDisplayName()
    {
        return this.data ? this.data.Name : "";
    }

    /**
     * Return true if this combatant is classified as an enemy.
     * @return bool
     */
    isEnemy()
    {
        return this.data && this.data.Job == "";
    }

    /**
     * Get value for given table column.
     * @param {string} name 
     * @param Date time
     * @return {string|float}
     */
    getTableCol(name, time)
    {
        // get data snapshot
        var data = this.getLastSnapshot();
        if (time) {
            data = this.getSnapshot(time);
        }
        switch(name) {
            case "name":
            {
                return this.getDisplayName();
            }
            case "world":
            {
                return data.World;
            }
            case "job":
            {
                return data.Job.toLowerCase();
            }
            case "damage":
            {
                return data.Damage;
            }
            case "healing":
            {
                return data.DamageHealed;
            }
            case "deaths":
            {
                return data.Deaths;
            }
            case "hits":
            {
                return data.Hits;   
            }
            case "heals":
            {
                return data.Heals;
            }
            case "kills":
            {
                return data.Kills;   
            }
        }
        return "";
    }

    /**
     * Get role of combatant. (healer, tank, dps)
     * @return string
     */
    getRole()
    {
        var job = this.data.Job.toUpperCase();
        for (var role in combatantRoleClasses) {
            if (combatantRoleClasses[role].indexOf(job) != -1) {
                return role;
            }
        }
        return combatantDefaultRoleClass;
    }

}