
/** Maximum number of players to show prior to clicking 'show more.' */
var MAX_LESS_SHOW = 10;

var statsElement = document.getElementById("player-stats");
var statFilterValueElement = document.getElementById("player-stat-filter-value");
var statFilterJobElement = document.getElementById("player-stat-filter-job")
var statFilterZoneElement = document.getElementById("player-stat-filter-zone");
var headerCols = ["rank", "encounter", "player", "job", "value"];
var filterValues = ["dps", "hps", "speed", "time", "damage", "healing"];

/** Fetch JSON stats dump. */
function fetchStats(sort, job)
{
    if (!sort) {
        sort = "dps";
    }
    statsElement.innerHTML = "Loading...";
    fetch("/stats_json?sort=" + sort + "&job=" + job)
        .then(function(resp) {
            return resp.json();
        })
        .then(function(data) {
            statsElement.innerHTML = "";
            buildFilterZoneElement(data);
            buildFilterJobElement(data);
            for (var i in data) {
                buildZoneElements(data[i], sort);
            }
            fflpFixFooter();
        })
    ;
}

/** Add jump to zone links. */
function buildFilterZoneElement(data)
{
    for (var i in data) {
        if (data[i].length == 0) {
            continue;
        }
        var zoneElement = document.createElement("a");
        zoneElement.href = "#" + data[i][0].encounter.zone;
        zoneElement.innerText = data[i][0].encounter.zone
        zoneElement.title = data[i][0].encounter.zone;
        statFilterZoneElement.appendChild(zoneElement);
    }
}

/** Add filter by job links. */
function buildFilterJobElement(data)
{
    // extract jobs
    var jobs = [];
    for (var i in data) {
        if (data[i].length == 0) {
            continue;
        }
        for (var j in data[i]) {
            var job = data[i][j].combatant.job;
            if (jobs.indexOf(job) == -1) {
                jobs.push(job);
            }
        }
    }
    if (PLAYER_STAT_JOB) {
        var jobFilterElement = document.createElement("a");
        jobFilterElement.href = "?sort=" + PLAYER_STAT_SORT + "&job=";
        jobFilterElement.innerText = "reset";
        statFilterJobElement.appendChild(jobFilterElement);
        return
    }
    
    var jobGroups = [
        ["tanks", ["Pld", "War", "Drk", "Gnb"]],
        ["healers", ["Sch", "Whm", "Ast"]],
        ["dps", ["Blm", "Smn", "Dnc", "Rdm", "Mnk", "Sam", "Drg", "Brd", "Mch", "Nin"]],
    ];

    for (var i in jobGroups) {
        var jobFilterElement = document.createElement("a");
        jobFilterElement.href = "?sort=" + PLAYER_STAT_SORT + "&job=" + jobGroups[i][1].join(",");
        jobFilterElement.innerText = jobGroups[i][0];
        statFilterJobElement.appendChild(jobFilterElement);
    }
    var jobFilterElement = document.createElement("br");
    statFilterJobElement.appendChild(jobFilterElement);

    for (var i in jobs) {
        var jobFilterElement = document.createElement("a");
        jobFilterElement.href = "?sort=" + PLAYER_STAT_SORT + "&job=" + jobs[i];
        var jobIcon = document.createElement("img");
        jobIcon.src = "/static/img/job/" + jobs[i].toLowerCase() + ".png";
        jobIcon.alt = jobs[i].toUpperCase();
        jobFilterElement.title = jobIcon.alt;
        jobFilterElement.appendChild(jobIcon);
        statFilterJobElement.appendChild(jobFilterElement);
    }
}

/** Add encounter zone title. */
function buildZoneHeaderElement(element)
{
    var headElement = document.createElement("div");
    headElement.classList.add("player-stat-head");
    for (var i in headerCols) {
        var colElement = document.createElement("div");
        colElement.classList.add("player-stat-col", headerCols[i]);
        colElement.innerText = headerCols[i];
        headElement.appendChild(colElement);
    }
    element.appendChild(headElement);
}

/** Build zone encounter table. */
function buildZoneElements(data, sort)
{
    if (data.length == 0) {
        return;
    }
    var zoneElement = document.createElement("div");
    zoneElement.classList.add("player-stat-zone", "hide-more");

    var anchorElement = document.createElement("a");
    anchorElement.name = data[0].encounter.zone;
    zoneElement.appendChild(anchorElement);

    var zoneTitleElement = document.createElement("h3");
    zoneTitleElement.innerText = data[0].encounter.zone;
    zoneElement.appendChild(zoneTitleElement);

    var goTopElement = document.createElement("a");
    goTopElement.href = "#";
    goTopElement.innerText = "top"
    goTopElement.classList.add("go-top")
    zoneElement.appendChild(goTopElement)

    buildZoneHeaderElement(zoneElement);
    for (var i in data) {
        var pData = data[i];
        var pDataElement = document.createElement("div");
        pDataElement.classList.add("player-stat-data");
        if (i >= MAX_LESS_SHOW) {
            pDataElement.classList.add("hide-more")
        }
        for (var j in headerCols) {
            var pColElement = document.createElement("div");
            pColElement.classList.add("player-stat-col", headerCols[j]);
            switch (headerCols[j]) {
                case "rank":
                {
                    pColElement.innerHTML = (parseInt(i) + 1);
                    pColElement.title = pColElement.innerHTML;
                    break;
                }
                case "encounter":
                {
                    var date = new Date(pData.encounter.start_time);
                    pColElement.innerHTML =  "<a href='" + pData.url + "'>" + date.toLocaleString() + "</a>";
                    pColElement.title = date.toLocaleString() + "(" + pData.encounter.uid + ")";
                    break;
                }
                case "player":
                {
                    pColElement.innerText = pData.combatant.player.name;
                    if (pData.combatant.player.world) {
                        pColElement.innerText += " (" + pData.combatant.player.world + ")";
                    }
                    pColElement.title = pColElement.innerText;
                    break;
                }
                case "job":
                {
                    var iconUrl = "/static/img/job/" + pData.combatant.job.toLowerCase() + ".png";
                    var jobIconElement = document.createElement("img");
                    jobIconElement.src = iconUrl;
                    jobIconElement.alt = pData.combatant.job.toUpperCase();
                    jobIconElement.title = jobIconElement.alt;
                    pColElement.appendChild(jobIconElement);
                    pColElement.title = jobIconElement.title;
                    break;
                }
                case "value":
                {
                    var value = null;
                    var percentVal = 0;
                    var percentMax = 0;
                    switch (sort) {
                        case "dps": {
                            value = parseFloat(pData.dps).toFixed(2);
                            percentMax = parseFloat(data[0].dps).toFixed(2);
                            percentVal = value;
                            break;
                        }
                        case "hps": {
                            value = parseFloat(pData.hps).toFixed(2);
                            percentMax = parseFloat(data[0].hps).toFixed(2);
                            percentVal = value;
                            break;
                        }
                        case "speed": {
                            var endTime = new Date(pData.encounter.end_time);
                            var startTime = new Date(pData.encounter.start_time);
                            value = ((endTime - startTime) / 1000) + "s";
                            break;
                        }
                        case "time": {
                            var endTime = new Date(pData.encounter.end_time);
                            value = endTime.toLocaleString();                                    
                            break;
                        }
                        case "damage": {
                            value = parseInt(pData.combatant.damage);
                            percentMax = data[0].combatant.damage;
                            percentVal = value;
                            break;
                        }
                        case "healing": {
                            value = parseInt(pData.combatant.damage_healed);
                            percentMax = data[0].combatant.damage_healed;
                            percentVal = value;
                            break;
                        }
                    }
                    pColElement.innerText = value;
                    pColElement.title = value;
                    if (percentVal > 0 && percentMax > 0) {
                        var percentValEle = document.createElement("span");
                        percentValEle.classList.add("player-stat-value-percent");
                        var percentage = (percentVal / (percentMax / 100)).toFixed(0);
                        percentValEle.innerText = percentage + "%";
                        percentValEle.title = percentValEle.innerText;
                        pColElement.appendChild(percentValEle);
                        if (percentage >= 100) {
                            percentValEle.classList.add("artifact");
                        } else if (percentage >= 90) {
                            percentValEle.classList.add("legendary");
                        } else if (percentage >= 75) {
                            percentValEle.classList.add("epic");
                        } else if (percentage >= 50) {
                            percentValEle.classList.add("rare");
                        } else if (percentage >= 25) {
                            percentValEle.classList.add("uncommon");
                        } else {
                            percentValEle.classList.add("common");
                        }
                    }
                    break;
                }
            }
            pDataElement.appendChild(pColElement);
        }
        zoneElement.appendChild(pDataElement);
    }
    // show more/less
    if (data.length > MAX_LESS_SHOW) {
        var pDataElement = document.createElement("div");
        pDataElement.classList.add("player-stat-data", "show-more");
        pDataElement.innerText = "Show More (+" + (data.length - MAX_LESS_SHOW) + ")";
        pDataElement.addEventListener("click", function(e) {
            e.preventDefault();
            zoneElement.classList.toggle("hide-more");
            return false;
        });
        zoneElement.appendChild(pDataElement);
    }
    zoneElement.appendChild(pDataElement);
    statsElement.appendChild(zoneElement);
}

// start on page load
if (typeof(PLAYER_STAT_JOB) != "undefined" && typeof(PLAYER_STAT_JOB) != "undefined") {
    window.addEventListener("load", function() { fetchStats(PLAYER_STAT_SORT, PLAYER_STAT_JOB); });
}
