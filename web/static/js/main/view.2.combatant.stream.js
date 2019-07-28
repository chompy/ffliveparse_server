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

class ViewCombatantStream extends ViewCombatantTable
{

    getName()
    {
        return "stream";
    }

    getTitle()
    {
        return "Stream";
    }

    init()
    {
        super.init();
        this.userConfig["sortBy"] = "damage";
        this.userConfig["columns"] = ["job", "name", "damage"];
        var t = this;
        setTimeout(function() {
            t.onResize();
        }, 100);
    }

    onActive()
    {
        super.onActive();
        document.getElementById("head").classList.add("hide");
        document.getElementById("footer").classList.add("hide");
        document.getElementsByTagName("html")[0].style.backgroundColor = "transparent";
        document.getElementsByTagName("body")[0].style.backgroundColor = "transparent";
        var mouseEvent;
        mouseEvent = window.addEventListener("mousemove", function(e) {
            window.removeEventListener("mousemove", mouseEvent);
            document.getElementById("head").classList.remove("hide");
            document.getElementById("footer").classList.remove("hide");
            document.getElementsByTagName("html")[0].style.backgroundColor = "";
            document.getElementsByTagName("body")[0].style.backgroundColor = "";
        });
    }

    displayCombatants()
    {
        super.displayCombatants()
        this.onResize();
    }

    updateColumnVisibility()
    {
        return;
    }

    processCooldownQueue()
    {
        return;
    }

    updateCooldowns()
    {
        return;
    }

    onResize()
    {
        var colElements = this.getElement().getElementsByClassName("combatant-col");
        for (var i = 0; i < colElements.length; i++) {
            if (colElements[i].classList.contains("name") || colElements[i].classList.contains("damage")) {
                colElements[i].style.width = (this.tableBody.offsetWidth - 78) + "px";
            }
        }        
    }

}
