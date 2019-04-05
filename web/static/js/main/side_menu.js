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

var SIDE_MENU_ID = "side-menu"
var SIDE_MENU_BTN_CLASS = "hamburger-open";
var SIDE_MENU_VIEWS_ID = "side-menu-views";

function initSideMenu()
{
    var element = document.getElementById(SIDE_MENU_ID);
    var windowClick = null;

    var buttons = document.getElementsByClassName(SIDE_MENU_BTN_CLASS);
    for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        button.addEventListener("click", function(e) {
            e.preventDefault();
            element.classList.remove("hide");
            if (windowClick) {
                window.removeEventListener("click", windowClick);
            }
            windowClick = window.addEventListener("click", function(e) {
                if (e.target == button || e.target.parentNode == button) {
                    return;
                }
                element.classList.add("hide") ;
                window.removeEventListener("click", windowClick);
            });
            return false;
        });
    }
}

function sideMenuAddView(view)
{
    var element = document.getElementById(SIDE_MENU_VIEWS_ID);
    var viewBtnElement = document.createElement("li");
    viewBtnElement.setAttribute("id", "view-btn-" + view.getName());
    var viewBtnLinkElement = document.createElement("a");
    viewBtnLinkElement.setAttribute("href", "#" + view.getName());
    viewBtnLinkElement.innerText = view.getTitle();
    viewBtnElement.appendChild(viewBtnLinkElement);
    element.appendChild(viewBtnElement);
}

function sideMenuSetActiveView(view)
{
    var element = document.getElementById(SIDE_MENU_VIEWS_ID);
    var viewBtnElements = element.getElementsByTagName("li");
    for (var i = 0; i < viewBtnElements.length; i++) {
        viewBtnElements[i].classList.remove("active");
    }
    document.getElementById("view-btn-" + view.getName()).classList.add("active");
}