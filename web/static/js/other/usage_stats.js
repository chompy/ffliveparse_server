
/** Render connection graph. */
function renderConnectionGraph(data)
{
    // convert data to graph values
    var labels = [];
    var actConnections = [];
    var webConnections = [];
    for (var i in data.snapshots) {
        var snapshot = data.snapshots[i];
        var time = new Date(snapshot.time);
        labels.push(
            time.toLocaleDateString() + " " + time.toLocaleTimeString()
        );
        var actConnectionCount = 0;
        var webConnectionCount = 0;
        for (var k in snapshot.connections.act) {
            actConnectionCount += snapshot.connections.act[k];
        }
        for (var k in snapshot.connections.web) {
            webConnectionCount += snapshot.connections.web[k];
        }
        actConnections.push(actConnectionCount);
        webConnections.push(webConnectionCount);
    }
    // configure graph
    var graphConfig = {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "ACT Connections",
                backgroundColor: "#ff0000",
                borderColor: "#ff0000",
                data: actConnections,
                fill: false,
            }, {
                label: "Web Connections",
                fill: false,
                backgroundColor: "#0000ff",
                borderColor: "#0000ff",
                data: webConnections,
            }]
        },
        options: {
            responsive: true,
            title: {
                display: true,
                text: "Connections"
            },
            tooltips: {
                mode: "index",
                intersect: false,
            },
            hover: {
                mode: "nearest",
                intersect: true
            },
            scales: {
                xAxes: [{
                    display: true,
                    scaleLabel: {
                        display: true,
                        labelString: "Time"
                    }
                }],
                yAxes: [{
                    display: true,
                    scaleLabel: {
                        display: true,
                        labelString: "Count"
                    }
                }]
            }
        }
    };
    // display graph
    var graphCtx = document.getElementById('graph-connections').getContext('2d');
    new Chart(graphCtx, graphConfig);
}

/** Render log lines graph. */
function renderLogLinesGraph(data)
{
    // convert data to graph values
    var labels = [];
    var logLines = [];
    for (var i in data.snapshots) {
        var snapshot = data.snapshots[i];
        var time = new Date(snapshot.time);
        labels.push(
            time.toLocaleDateString() + ' ' + time.toLocaleTimeString()
        );
        logLines.push(snapshot.log_lines_per_minutes);
    }
    // configure graph
    var graphConfig = {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Log Lines Per Minute",
                backgroundColor: "#ff0000",
                borderColor: "#ff0000",
                data: logLines,
                fill: false,
            }]
        },
        options: {
            responsive: true,
            title: {
                display: true,
                text: "Log Lines Processed"
            },
            tooltips: {
                mode: "index",
                intersect: false,
            },
            hover: {
                mode: "nearest",
                intersect: true
            },
            scales: {
                xAxes: [{
                    display: true,
                    scaleLabel: {
                        display: true,
                        labelString: "Time"
                    }
                }],
                yAxes: [{
                    display: true,
                    scaleLabel: {
                        display: true,
                        labelString: "Count"
                    }
                }]
            }
        }
    };
    // display graph
    var graphCtx = document.getElementById("graph-log-lines").getContext("2d");
    new Chart(graphCtx, graphConfig);    
}

/** Fetch usage stats. */
function fetchStats() {
    fetch("/_usage_json")
        .then((resp) => resp.json())
        .then(function(data) {
            renderConnectionGraph(data);
            renderLogLinesGraph(data);
            fflpFixFooter();
        })
    ;
}

// load usage stats on page load
window.addEventListener("load", fetchStats);
