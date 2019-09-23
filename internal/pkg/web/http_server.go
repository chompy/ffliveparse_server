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

package web

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"io/ioutil"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/yosssi/gcss"

	"github.com/olebedev/emitter"
	"github.com/tdewolff/minify"
	"github.com/tdewolff/minify/css"
	"github.com/tdewolff/minify/js"

	"golang.org/x/net/websocket"

	"../act"
	"../app"
	"../data"
	"../storage"
	"../user"
)

// webKeyCookieName - name of cookie to store web key in
const webKeyCookieName = "webKey"

// htmlTemplates - map of html templates
var htmlTemplates map[string]*template.Template

// templateData - Struct containing data to be made available to html template
type templateData struct {
	User                    data.User
	HasUser                 bool
	WebIDString             string
	EncounterUID            string
	AppName                 string
	VersionString           string
	ActVersionString        string
	ErrorMessage            string
	StatActConnections      int
	StatActiveWebUsers      int
	StatPageLoads           int
	Encounters              []act.GameSession
	EncounterCurrentPage    int
	EncounterTotalPage      int
	EncounterNextPageOffset int
	EncounterPrevPageOffset int
	QueryString             template.URL
	HistorySearchQuery      string
	HistoryStartDate        string
	HistoryEndDate          string
	PlayerStatSortOptions   []string
	PlayerStatSort          string
	PlayerStatJob           string
}

// websocketConnection - Websocket connection data associated with user data
type websocketConnection struct {
	connection *websocket.Conn
	userData   data.User
}

// HTTPStartServer - Start HTTP server
func HTTPStartServer(
	port uint16,
	userManager *user.Manager,
	actManager *act.Manager,
	events *emitter.Emitter,
	storageManager *storage.Manager,
	usageStatCollector *app.StatCollector,
	playerStatTracker *act.StatsTracker,
	devMode bool,
) {
	// init logger
	appLog := app.Logging{ModuleName: "WEB"}
	// load html templates
	appLog.Start("Start loading HTML templates.")
	var err error
	htmlTemplates, err = getTemplates()
	if err != nil {
		appLog.Panic(err)
	}
	appLog.Finish("Finished loading HTML templates.")
	// count page loads
	pageLoads := 0
	// websocket connection list
	websocketConnections := make([]websocketConnection, 0)
	// serve static assets
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("./web/static"))))
	// compile/minify javascript, serve compiled js
	appLog.Start("Start compiling javascript.")
	compiledJs, err := compileJavascript()
	if err != nil {
		appLog.Panic(err)
	}
	appLog.Finish("Finished compiling javascript.")
	http.HandleFunc("/app.min.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript;charset=utf-8")
		// in dev mode recompile js every request
		if devMode {
			compiledJs, err = compileJavascript()
			if err != nil {
				appLog.Panic(err)
			}
		}
		fmt.Fprint(w, compiledJs["app.js"])
	})
	http.HandleFunc("/worker.min.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript;charset=utf-8")
		// in dev mode recompile js every request
		if devMode {
			compiledJs, err = compileJavascript()
			if err != nil {
				appLog.Panic(err)
			}
		}
		fmt.Fprint(w, compiledJs["worker.js"])
	})
	// compile/minify css, serve compiled css
	appLog.Start("Start compiling CSS.")
	compiledCSS, err := compileGCSS()
	if err != nil {
		appLog.Panic(err)
	}
	appLog.Finish("Finished compiling CSS.")
	http.HandleFunc("/app.min.css", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/css;charset=utf-8")
		// in dev mode recompile css every request
		if devMode {
			compiledCSS, err = compileGCSS()
			if err != nil {
				appLog.Panic(err)
			}
		}
		fmt.Fprint(w, compiledCSS["app.min.css"])
	})
	// setup websocket connections
	http.Handle("/ws/", websocket.Handler(func(ws *websocket.Conn) {
		// split url path in to parts
		urlPathParts := strings.Split(strings.TrimLeft(ws.Request().URL.Path, "/"), "/")
		// need user ID to be present in url
		if len(urlPathParts) <= 1 {
			return
		}
		// get user ID string
		userID := urlPathParts[1]
		// get encounter uid string
		encounterUID := ""
		if len(urlPathParts) >= 3 {
			encounterUID = urlPathParts[2]
		}
		appLog.Log(fmt.Sprintf("Start web socket connection for user '%s' from '%s.'", userID, ws.Request().RemoteAddr))
		// fetch user data
		userData, err := userManager.LoadFromWebIDString(userID)
		if err != nil {
			appLog.Error(err)
			return
		}
		// get act data from web ID
		actSession, err := actManager.GetSessionWithWebID(userID)
		if err != nil {
			appLog.Error(err)
			return
		}
		// relay previous encounter data if encounter id was provided
		if encounterUID != "" && (actSession == nil || encounterUID != actSession.EncounterCollector.Encounter.UID) {
			appLog.Log(fmt.Sprintf("Load previous encounter '%s' for user '%s.'", encounterUID, userID))
			previousEncounter, err := act.GetPreviousEncounter(storageManager, userData, encounterUID)
			if err != nil {
				appLog.Error(err)
				return
			}
			sendInitData(ws, &previousEncounter)
		} else {
			// get act data from web ID
			actSession, err := actManager.GetSessionWithWebID(userID)
			if err != nil {
				appLog.Error(err)
				return
			}
			// send init data
			sendInitData(ws, actSession)
		}
		// add websocket connection to global list
		websocketConnections = append(
			websocketConnections,
			websocketConnection{
				connection: ws,
				userData:   userData,
			},
		)
		defer func() {
			for index := range websocketConnections {
				if websocketConnections[index].connection == ws {
					appLog.Log(fmt.Sprintf("Close web socket connection for '%s.'", ws.Request().RemoteAddr))
					websocketConnections = append(websocketConnections[:index], websocketConnections[index+1:]...)
					break
				}
			}
			ws.Close()
		}()

		// listen/wait for incomming messages
		wsReader(ws, actManager)
	}))
	http.HandleFunc("/new", func(w http.ResponseWriter, r *http.Request) {
		// inc page load count
		pageLoads++
		// create a new user
		appLog.Log("Create new user.")
		userData := userManager.New()
		if err != nil {
			appLog.Error(err)
			displayError(
				w,
				"An error occured while creating a new user ID.",
				http.StatusInternalServerError,
			)
			return
		}
		// set web key to cookie
		cookie := getWebKeyCookie(userData, r)
		http.SetCookie(w, &cookie)
		// perform redirect to home page
		http.Redirect(w, r, "/", http.StatusFound)
	})
	// display stats
	http.HandleFunc("/usage", func(w http.ResponseWriter, r *http.Request) {
		// set resposne headers
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// build template data
		td := getBaseTemplateData()
		// collect stats
		td.StatActConnections = actManager.SessionCount()
		td.StatActiveWebUsers = len(websocketConnections)
		td.StatPageLoads = pageLoads
		// render stats template
		htmlTemplates["usage_stats.tmpl"].ExecuteTemplate(w, "base.tmpl", td)
	})
	// display json stats
	http.HandleFunc("/_usage_json", func(w http.ResponseWriter, r *http.Request) {
		// set resposne headers
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		jsonBytes, err := json.Marshal(usageStatCollector)
		if err != nil {
			appLog.Error(err)
			displayError(
				w,
				"An error occured while displaying stats",
				http.StatusInternalServerError,
			)
			return
		}
		w.Write(jsonBytes)
	})
	// display past encounters
	http.HandleFunc("/history/", func(w http.ResponseWriter, r *http.Request) {
		// inc page load count
		pageLoads++
		// set resposne headers
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// build template data
		td := getBaseTemplateData()
		// split url path in to parts
		urlPathParts := strings.Split(strings.TrimLeft(r.URL.Path, "/"), "/")
		// get web id from url path
		webUID := ""
		if len(urlPathParts) > 1 {
			webUID = urlPathParts[1]
		}
		if webUID == "" {
			displayError(
				w,
				"User was not provided.",
				http.StatusNotFound,
			)
			return
		}
		// get user data
		userData, err := userManager.LoadFromWebIDString(webUID)
		if err != nil {
			appLog.Error(err)
			displayError(
				w,
				"Unable to find session for user \""+webUID+".\"",
				http.StatusNotFound,
			)
			return
		}
		addUserToTemplateData(&td, userData)
		td.WebIDString = webUID
		// get offset
		offsetString := r.URL.Query().Get("offset")
		offset := int(0)
		if offsetString != "" {
			offsetI64, err := strconv.ParseInt(offsetString, 10, 64)
			if err != nil {
				displayError(
					w,
					"Invalid offset",
					http.StatusInternalServerError,
				)
				return
			}
			offset = int(offsetI64)
		}
		if offset < 0 {
			offset = 0
		}
		// get encounters
		td.HistorySearchQuery = r.URL.Query().Get("search")
		td.HistoryStartDate = r.URL.Query().Get("start")
		td.HistoryEndDate = r.URL.Query().Get("end")
		tzOffsetStr := r.URL.Query().Get("tz")
		td.QueryString = template.URL(
			fmt.Sprintf(
				"search=%s&start=%s&end=%s&tz=%s",
				td.HistorySearchQuery,
				td.HistoryStartDate,
				td.HistoryEndDate,
				tzOffsetStr,
			),
		)
		tzOffset := 0
		if tzOffsetStr != "" {
			tzOffset, err = strconv.Atoi(tzOffsetStr)
			if err != nil {
				appLog.Error(err)
				displayError(
					w,
					"Error parsing time zone \""+tzOffsetStr+".\"",
					http.StatusInternalServerError,
				)
				return
			}
		}
		var startTime *time.Time
		if td.HistoryStartDate != "" {
			_startTime, err := time.Parse(
				time.RFC3339,
				fmt.Sprintf(td.HistoryStartDate+"T00:00:00-%02d:00", tzOffset/60),
			)
			startTime = &_startTime
			if err != nil {
				appLog.Error(err)
				displayError(
					w,
					"Error parsing start date \""+td.HistoryStartDate+".\"",
					http.StatusInternalServerError,
				)
				return
			}
		}
		var endTime *time.Time
		if td.HistoryEndDate != "" {
			_endTime, err := time.Parse(
				time.RFC3339,
				fmt.Sprintf(td.HistoryEndDate+"T23:59:59-%02d:00", tzOffset/60),
			)
			endTime = &_endTime
			if err != nil {
				appLog.Error(err)
				displayError(
					w,
					"Error parsing end date \""+td.HistoryEndDate+".\"",
					http.StatusInternalServerError,
				)
				return
			}
		}
		totalEncounterCount := 0
		td.Encounters, err = act.GetPreviousEncounters(
			storageManager,
			userData,
			int(offset),
			td.HistorySearchQuery,
			startTime,
			endTime,
			&totalEncounterCount,
		)
		if err == nil {
			td.EncounterTotalPage = int(math.Floor(float64(totalEncounterCount)/float64(app.PastEncounterFetchLimit))) + 1
			if offset > totalEncounterCount-app.PastEncounterFetchLimit {
				offset = (td.EncounterTotalPage - 1) * app.PastEncounterFetchLimit
			}
			td.EncounterCurrentPage = 1 + int(math.Floor(float64(offset)/float64(app.PastEncounterFetchLimit)))
			td.EncounterNextPageOffset = int(offset) + app.PastEncounterFetchLimit
			td.EncounterPrevPageOffset = int(offset) - app.PastEncounterFetchLimit
		}
		if err != nil {
			appLog.Error(err)
			displayError(
				w,
				"Unable to fetch past encounters.",
				http.StatusInternalServerError,
			)
			return
		}
		// render encounters template
		htmlTemplates["history.tmpl"].ExecuteTemplate(w, "base.tmpl", td)
	})

	// display player stats
	http.HandleFunc("/stats", func(w http.ResponseWriter, r *http.Request) {
		// set resposne headers
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// filter options
		td := getBaseTemplateData()
		td.PlayerStatSortOptions = []string{"dps", "hps", "speed", "time", "damage", "healing"}
		td.PlayerStatSort = r.URL.Query().Get("sort")
		if td.PlayerStatSort == "" {
			td.PlayerStatSort = "dps"
		}
		td.PlayerStatJob = r.URL.Query().Get("job")
		// render stats template
		htmlTemplates["player_stats.tmpl"].ExecuteTemplate(w, "base.tmpl", td)
	})

	// display player stats JSON
	http.HandleFunc("/stats_json", func(w http.ResponseWriter, r *http.Request) {
		// set resposne headers
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		// sort
		statSort := r.URL.Query().Get("sort")
		if statSort == "" {
			statSort = ""
		}
		job := r.URL.Query().Get("job")
		// fetch zones
		zones := make([][]*data.PlayerStat, 0)
		if playerStatTracker != nil {
			for _, zoneName := range act.StatTrackerZones {
				zones = append(
					zones,
					playerStatTracker.GetZoneStats(zoneName, job, statSort),
				)
			}
		}
		jsonBytes, err := json.Marshal(zones)
		if err != nil {
			appLog.Error(err)
			displayError(
				w,
				"An error occured while displaying player stats",
				http.StatusInternalServerError,
			)
			return
		}
		w.Write(jsonBytes)
	})

	// ping
	http.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		output := "OK"
		w.Write([]byte(output))
	})
	// setup main page/index
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// inc page load count
		pageLoads++
		// split url path in to parts
		urlPathParts := strings.Split(strings.TrimLeft(r.URL.Path, "/"), "/")
		// get web id from url path
		webID := urlPathParts[0]
		// build template data
		td := getBaseTemplateData()
		// get encounter id from url path
		if len(urlPathParts) >= 2 {
			td.EncounterUID = urlPathParts[1]
		}
		// set resposne headers
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// if web ID provided in URL attempt to serve up main app
		if webID != "" {
			userData, err := userManager.LoadFromWebIDString(webID)
			if err != nil {
				appLog.Error(err)
				displayError(
					w,
					"Unable to find session for user \""+webID+".\"",
					http.StatusNotFound,
				)
				return
			}
			addUserToTemplateData(&td, userData)
			htmlTemplates["app.tmpl"].ExecuteTemplate(w, "base.tmpl", td)
			return
		}
		// get cookie, use it to fetch user data
		cookie, err := r.Cookie(webKeyCookieName)
		if err == nil {
			userData, err := userManager.LoadFromWebKey(cookie.Value)
			if err == nil {
				addUserToTemplateData(&td, userData)
			} else {
				appLog.Error(err)
			}
		}
		// no web id provided, serve up home page with connection info
		htmlTemplates["home.tmpl"].ExecuteTemplate(w, "base.tmpl", td)

	})
	// start thread for sending handling act events and sending data back to ws clients
	go globalWsWriter(&websocketConnections, events)
	// listen for snapshot events
	go snapshotListener(&websocketConnections, events, &pageLoads)
	// start http server
	http.ListenAndServe(":"+strconv.Itoa(int(port)), nil)
}

func getTemplates() (map[string]*template.Template, error) {
	// create template map
	var templates = make(map[string]*template.Template)
	// get path to all include templates
	includeFiles, err := filepath.Glob("./web/templates/includes/*.tmpl")
	if err != nil {
		return nil, err
	}
	// get path to all layout templates
	layoutFiles, err := filepath.Glob("./web/templates/layouts/*.tmpl")
	if err != nil {
		return nil, err
	}
	// make layout templates
	for _, layoutFile := range layoutFiles {
		templateFiles := append(includeFiles, layoutFile)
		templates[filepath.Base(layoutFile)] = template.Must(template.ParseFiles(templateFiles...))
	}
	return templates, nil
}

// compileJavascript - Compile all javascript in to single string that can be served from memory
func compileJavascript() (map[string]string, error) {
	jsDirs := make(map[string]string)
	jsDirs["app.js"] = "./web/static/js/main"
	jsDirs["worker.js"] = "./web/static/js/worker"
	output := make(map[string]string)
	for jsFile, jsDir := range jsDirs {
		files, err := ioutil.ReadDir(jsDir)
		if err != nil {
			return output, err
		}
		compiledJs := ""
		for _, file := range files {
			filename := file.Name()
			if !strings.HasSuffix(filename, ".js") {
				continue
			}
			js, err := ioutil.ReadFile(jsDir + "/" + filename)
			if err != nil {
				return output, err
			}
			compiledJs += string(js)
		}
		m := minify.New()
		m.AddFunc("text/javascript", js.Minify)
		compiledJs, err = m.String("text/javascript", compiledJs)
		if err != nil {
			return output, err
		}
		output[jsFile] = compiledJs
	}
	return output, nil
}

// compileGCSS - Compile all GCSS in to single string that can be served from memory
func compileGCSS() (map[string]string, error) {
	cssDirs := make(map[string]string)
	cssDirs["app.min.css"] = "./web/static/css"
	output := make(map[string]string)
	for cssFile, cssDir := range cssDirs {
		files, err := ioutil.ReadDir(cssDir)
		if err != nil {
			return output, err
		}
		compiledCSS := ""
		for _, file := range files {
			filename := file.Name()
			if !strings.HasSuffix(filename, ".gcss") {
				continue
			}
			// open gcss file
			gcssFile, err := os.Open(cssDir + "/" + filename)
			if err != nil {
				return nil, err
			}
			defer gcssFile.Close()
			// create css buffer to write compiled gcss to
			var cssBuf bytes.Buffer
			cssBufIo := bufio.NewWriter(&cssBuf)
			// compile gcss
			_, err = gcss.Compile(cssBufIo, gcssFile)
			if err != nil {
				return nil, err
			}
			cssBufIo.Flush()
			// add to compiled css string
			if err != nil {
				return output, err
			}
			compiledCSS += cssBuf.String()
		}
		// minify css string
		m := minify.New()
		m.AddFunc("text/css", css.Minify)
		compiledCSS, err = m.String("text/css", compiledCSS)
		if err != nil {
			return nil, err
		}
		output[cssFile] = compiledCSS
	}
	return output, nil
}

func wsReader(ws *websocket.Conn, actManager *act.Manager) {
	for {
		if ws == nil || actManager == nil {
			break
		}
		var data []byte
		err := websocket.Message.Receive(ws, &data)
		if err != nil {
			break
		}
	}
}

func globalWsWriter(websocketConnections *[]websocketConnection, events *emitter.Emitter) {
	for {
		if websocketConnections == nil {
			break
		}
		for event := range events.On("act:*") {
			for _, websocketConnection := range *websocketConnections {
				if websocketConnection.connection == nil || event.Args[0] != websocketConnection.userData.ID {
					continue
				}
				websocket.Message.Send(
					websocketConnection.connection,
					event.Args[1],
				)
			}
		}
	}
}

func snapshotListener(websocketConnections *[]websocketConnection, events *emitter.Emitter, pageLoads *int) {
	for {
		for event := range events.On("stat:snapshot") {
			statSnapshot := event.Args[0].(*app.StatSnapshot)
			statSnapshot.PageLoads = *pageLoads
			if websocketConnections == nil {
				break
			}
			for _, websocketConnection := range *websocketConnections {
				if websocketConnection.connection == nil {
					continue
				}
				userIDString, err := websocketConnection.userData.GetWebIDString()
				if err == nil {
					statSnapshot.Connections.Web[userIDString]++
				}
			}
		}
	}
}

func getBaseTemplateData() templateData {
	return templateData{
		VersionString:    app.GetVersionString(),
		ActVersionString: app.GetActVersionString(),
		AppName:          app.Name,
		HasUser:          false,
	}
}

func addUserToTemplateData(td *templateData, u data.User) {
	td.User = u
	td.WebIDString, _ = u.GetWebIDString()
	td.HasUser = true
}

func displayError(w http.ResponseWriter, message string, statusCode int) {
	w.WriteHeader(statusCode)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	td := getBaseTemplateData()
	td.ErrorMessage = message
	htmlTemplates["error.tmpl"].ExecuteTemplate(w, "base.tmpl", td)
}

func getWebKeyCookie(user data.User, r *http.Request) http.Cookie {
	return http.Cookie{
		Name:    webKeyCookieName,
		Value:   user.WebKey,
		Expires: time.Now().Add(365 * 24 * time.Hour),
		Domain:  r.URL.Hostname(),
	}
}

// sendInitData - Send initial data to web user to sync their session
func sendInitData(ws *websocket.Conn, gameSession *act.GameSession) {
	appLog := app.Logging{ModuleName: "WEB"}
	// add flag indicating if ACT is active
	isActiveFlag := data.Flag{
		Name:  "active",
		Value: gameSession != nil && gameSession.IsActive(),
	}
	activeCompress, err := data.CompressBytes(isActiveFlag.ToBytes())
	if err != nil {
		appLog.Error(err)
		return
	}
	websocket.Message.Send(ws, activeCompress)
	appLog.Log(fmt.Sprintf("Send %d bytes (flags) of data to '%s.'", len(activeCompress), ws.Request().RemoteAddr))
	// must have active encounter for the rest
	if gameSession == nil || gameSession.EncounterCollector.Encounter.UID == "" {
		return
	}
	// prepare data
	dataBytes := make([]byte, 0)
	// send encounter
	dataBytes = append(dataBytes, gameSession.EncounterCollector.Encounter.ToBytes()...)
	if err != nil {
		appLog.Error(err)
		return
	}
	// add combatants
	for _, snapshots := range gameSession.CombatantCollector.GetSnapshots() {
		for _, combatant := range snapshots {
			combatant.EncounterUID = gameSession.EncounterCollector.Encounter.UID
			combatant.UserID = gameSession.User.ID
			dataBytes = append(dataBytes, combatant.ToBytes()...)
		}
	}
	// compress + send
	dataBytes, err = data.CompressBytes(dataBytes)
	appLog.Log(fmt.Sprintf("Send %d bytes (encounter/combatants) of data to '%s.'", len(dataBytes), ws.Request().RemoteAddr))
	err = websocket.Message.Send(ws, dataBytes)
	if err != nil {
		appLog.Error(err)
		return
	}
	// send encounter
	// TODO buffer reads for memory usage
	var reader io.ReadCloser
	if gameSession.EncounterCollector.Encounter.Active {
		// send from temp buffer (for active encounter)
		reader, err = gameSession.Buffer.GetReadFile()
		if err != nil {
			appLog.Error(err)
			return
		}
		defer reader.Close()
	} else {
		// send from permanent storage
		reader, err = gameSession.Storage.File.OpenRead(gameSession.EncounterCollector.Encounter.UID)
		if err == os.ErrNotExist {
			return
		}
		if err != nil {
			appLog.Error(err)
			return
		}
		defer reader.Close()
		defer gameSession.Storage.File.Close()
	}
	dataBytes, err = ioutil.ReadAll(reader)
	if err != nil {
		appLog.Error(err)
		return
	}
	dataBytes, err = data.CompressBytes(dataBytes)
	if err != nil {
		appLog.Error(err)
		return
	}
	appLog.Log(fmt.Sprintf("Send %d bytes (buffer) of data to '%s.'", len(dataBytes), ws.Request().RemoteAddr))
	websocket.Message.Send(ws, dataBytes)
}
