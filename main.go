package main

import (
	"flag"
	"fmt"

	"github.com/olebedev/emitter"

	"./src/app"
	"./src/session"
	"./src/web"
)

// ActListenUDPPort - Port act server will listen on
const ActListenUDPPort uint16 = 31593

// HTTPListenTCPPort - Port http server will listen on
const HTTPListenTCPPort uint16 = 8081

func main() {
	appLog := app.Logging{ModuleName: "MAIN"}
	// define+parse flags
	devModePtr := flag.Bool("dev", false, "Start server in development mode.")
	httpPort := flag.Int("http-port", int(HTTPListenTCPPort), "Set HTTP listen port.")
	actPort := flag.Int("act-port", int(ActListenUDPPort), "Set UDP port to recieved data from ACT on.")
	flag.Parse()

	// log start
	appLog.Log(fmt.Sprintf("%s -- Version %s\n", app.Name, app.GetVersionString()))
	if *devModePtr {
		appLog.Log("Development mode enabled.")
	}

	// create event emitter
	events := emitter.Emitter{}

	// create usage stat collector
	usageStatCollector := app.NewStatCollector(&events)
	usageStatCollector.TakeSnapshot()
	go usageStatCollector.Start()

	// create session manager
	sessionManager, err := session.NewSessionManager(&events)
	if err != nil {
		panic(err)
	}

	// start http server
	go web.HTTPStartServer(
		uint16(*httpPort),
		&sessionManager,
		&events,
		&usageStatCollector,
		*devModePtr,
	)

	// start act listen server
	session.Listen(uint16(*actPort), &sessionManager)

}
