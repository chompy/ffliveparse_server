package main

import (
	"flag"
	"log"

	"github.com/olebedev/emitter"

	"./internal/pkg/act"
	"./internal/pkg/app"
	"./internal/pkg/user"
	"./internal/pkg/web"
)

// ActListenUDPPort - Port act server will listen on
const ActListenUDPPort uint16 = 31593

// HTTPListenTCPPort - Port http server will listen on
const HTTPListenTCPPort uint16 = 8081

func main() {
	// define+parse flags
	devModePtr := flag.Bool("dev", false, "Start server in development mode.")
	httpPort := flag.Int("http-port", int(HTTPListenTCPPort), "Set HTTP listen port.")
	actPort := flag.Int("act-port", int(ActListenUDPPort), "Set UDP port to recieved data from ACT on.")
	flag.Parse()

	// log start
	log.Printf("%s -- Version %s\n", app.Name, app.GetVersionString())
	if *devModePtr {
		log.Println("Development mode enabled.")
	}

	// create event emitter
	events := emitter.Emitter{}

	// create stat collector
	statCollector := app.NewStatCollector(&events)
	statCollector.TakeSnapshot()
	go statCollector.Start()

	// create user manager
	userManager, err := user.NewManager()
	defer userManager.Close()
	if err != nil {
		log.Panicln("Error occured while initalizing the user manager,", err)
	}

	// create act manager
	actManager := act.NewManager(&events, &userManager, *devModePtr)
	go actManager.SnapshotListener()
	defer actManager.ClearAllData()

	// clean up old encounters
	go act.CleanUpEncounters()

	// start http server
	go web.HTTPStartServer(uint16(*httpPort), &userManager, &actManager, &events, &statCollector, *devModePtr)

	// start act listen server
	act.Listen(uint16(*actPort), &actManager)
}
