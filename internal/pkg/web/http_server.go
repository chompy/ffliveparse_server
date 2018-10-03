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
	"fmt"
	"html/template"
	"io/ioutil"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/martinlindhe/base36"
	"github.com/olebedev/emitter"
	"github.com/tdewolff/minify"
	"github.com/tdewolff/minify/css"
	"github.com/tdewolff/minify/js"

	"golang.org/x/net/websocket"

	"../act"
	"../app"
	"../user"
)

// webKeyCookieName - name of cookie to store web key in
const webKeyCookieName = "webKey"

// htmlTemplates - map of html templates
var htmlTemplates map[string]*template.Template

// templateData - Struct containing data to be made available to html template
type templateData struct {
	User              user.Data
	HasUser           bool
	WebIDString       string
	EncounterIDString string
	AppName           string
	VersionString     string
	ErrorMessage      string
}

// websocketConnection - Websocket connection data associated with user data
type websocketConnection struct {
	connection *websocket.Conn
	userData   user.Data
}

// HTTPStartServer - Start HTTP server
func HTTPStartServer(port uint16, userManager *user.Manager, actManager *act.Manager, events *emitter.Emitter, devMode bool) {
	// load html templates
	var err error
	htmlTemplates, err = getTemplates()
	if err != nil {
		log.Panicln("Error occured while loading HTML templates,", err)
	}
	// websocket connection list
	websocketConnections := make([]websocketConnection, 0)
	// serve static assets
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("./web/static"))))
	// compile/minify javascript, serve compiled js
	compiledJs, err := compileJavascript()
	if err != nil {
		log.Panicln("Error occured while compiling javascript,", err)
	}
	http.HandleFunc("/app.min.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript;charset=utf-8")
		// in dev mode recompile js every request
		if devMode {
			compiledJs, err = compileJavascript()
			if err != nil {
				log.Panicln("Error occured while compiling javascript,", err)
			}
		}
		fmt.Fprint(w, compiledJs)
	})
	// compile/minify css, serve compiled css
	compiledCSS, err := compileCSS()
	if err != nil {
		log.Panicln("Error occured while compiling CSS,", err)
	}
	http.HandleFunc("/app.min.css", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/css;charset=utf-8")
		// in dev mode recompile css every request
		if devMode {
			compiledCSS, err = compileCSS()
			if err != nil {
				log.Panicln("Error occured while compiling CSS,", err)
			}
		}
		fmt.Fprint(w, compiledCSS)
	})
	// setup websocket connections
	http.Handle("/ws/", websocket.Handler(func(ws *websocket.Conn) {
		// split url path in to parts
		urlPathParts := strings.Split(strings.TrimLeft(ws.Request().URL.Path, "/"), "/")
		// need at once web ID to be present in url
		if len(urlPathParts) <= 1 {
			return
		}
		// get web ID string (base36 user ID)
		webID := urlPathParts[1]
		// get encounter id string
		encounterID := ""
		if len(urlPathParts) >= 3 {
			encounterID = urlPathParts[2]
		}
		// fetch user data
		userData, err := userManager.LoadFromWebIDString(webID)
		if err != nil {
			log.Println("Error when attempting to retreive user", webID, ",", err)
			return
		}
		// log
		log.Println("New web socket session for ACT user", userData.ID, "from", ws.RemoteAddr())
		// get act data from web ID
		actData := actManager.GetDataWithWebID(webID)
		// get encounter id int
		encounterIDInt := int32(0)
		if encounterID != "" {
			encounterIDInt = int32(base36.Decode(encounterID))
		}
		// relay previous encounter data if encounter id was provided
		if encounterID != "" && (actData == nil || encounterIDInt != actData.Encounter.ID) {
			log.Println("Load previous encounter data (EncounterID:", encounterID, ", UserID:", userData.ID, ")")
			previousEncounter, err := act.GetPreviousEncounter(userData, encounterIDInt)
			if err != nil {
				log.Println("Error when retreiving previous encounter", encounterID, "for user", userData.ID, ",", err)
				return
			}
			sendInitData(ws, &previousEncounter)
		} else {
			// get act data from web ID
			actData := actManager.GetDataWithWebID(webID)
			// send init data
			sendInitData(ws, actData)
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
					log.Println("Close web connection for", ws.RemoteAddr())
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
		// create a new user
		userData, err := userManager.New()
		if err != nil {
			log.Println("Error occured while creating a new user,", err)
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
	// setup main page/index
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// split url path in to parts
		urlPathParts := strings.Split(strings.TrimLeft(r.URL.Path, "/"), "/")
		// get web id from url path
		webID := urlPathParts[0]
		// build template data
		td := getBaseTemplateData()
		// get encounter id from url path
		if len(urlPathParts) >= 2 {
			td.EncounterIDString = urlPathParts[1]
		}
		// set resposne headers
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// if web ID provided in URL attempt to serve up main app
		if webID != "" {
			userData, err := userManager.LoadFromWebIDString(webID)
			if err != nil {
				displayError(
					w,
					"Unable to find session for user \""+webID+".\"",
					http.StatusNotFound,
				)
				log.Println("Error when attempting to retreive user", webID, ",", err)
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
				log.Println("Could not fetch user with web key,", cookie.Value, ",", err)
			}
		}
		// no web id provided, serve up home page with connection info
		htmlTemplates["home.tmpl"].ExecuteTemplate(w, "base.tmpl", td)

	})
	// start thread for sending handling act events and sending data back to ws clients
	go globalWsWriter(&websocketConnections, events)
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
func compileJavascript() (string, error) {
	log.Println("Compiling and minifying javascript...")
	files, err := ioutil.ReadDir("./web/static/js")
	if err != nil {
		return "", err
	}
	compiledJs := ""
	for _, file := range files {
		filename := file.Name()
		if !strings.HasSuffix(filename, ".js") {
			continue
		}
		js, err := ioutil.ReadFile("./web/static/js/" + filename)
		if err != nil {
			return "", err
		}
		compiledJs += string(js)
	}
	m := minify.New()
	m.AddFunc("text/javascript", js.Minify)
	compiledJs, err = m.String("text/javascript", compiledJs)
	if err != nil {
		return "", err
	}
	log.Println("...Done.")
	return compiledJs, nil
}

// compileCSS - Compile all CSS in to single string that can be served from memory
func compileCSS() (string, error) {
	log.Println("Compiling and minifing CSS...")
	// compile all css in to a single string
	files, err := ioutil.ReadDir("./web/static/css")
	if err != nil {
		return "", err
	}
	compiledCSS := ""
	for _, file := range files {
		filename := file.Name()
		if !strings.HasSuffix(filename, ".css") {
			continue
		}
		js, err := ioutil.ReadFile("./web/static/css/" + filename)
		if err != nil {
			return "", err
		}
		compiledCSS += string(js)
	}
	// minify css string
	m := minify.New()
	m.AddFunc("text/css", css.Minify)
	compiledCSS, err = m.String("text/css", compiledCSS)
	if err != nil {
		return "", err
	}
	log.Println("...Done.")
	return compiledCSS, nil
}

func wsReader(ws *websocket.Conn, actManager *act.Manager) {
	for {
		if ws == nil || actManager == nil {
			break
		}
		var data []byte
		err := websocket.Message.Receive(ws, &data)
		if err != nil {
			log.Println("Error occured while reading web socket message,", err)
			break
		}
		// nothing todo
		log.Println("Recieved websocket message", data)
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
				log.Println("ACT event", event.OriginalTopic, ", send data for user", websocketConnection.userData.ID, "to", websocketConnection.connection.RemoteAddr())
				websocket.Message.Send(
					websocketConnection.connection,
					event.Args[1],
				)
			}
		}
	}
}

func getBaseTemplateData() templateData {
	return templateData{
		VersionString: app.GetVersionString(),
		AppName:       app.Name,
		HasUser:       false,
	}
}

func addUserToTemplateData(td *templateData, u user.Data) {
	td.User = u
	td.WebIDString = u.GetWebIDString()
	td.HasUser = true
}

func displayError(w http.ResponseWriter, message string, statusCode int) {
	w.WriteHeader(statusCode)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	td := getBaseTemplateData()
	td.ErrorMessage = message
	htmlTemplates["error.tmpl"].ExecuteTemplate(w, "base.tmpl", td)
}

func getWebKeyCookie(user user.Data, r *http.Request) http.Cookie {
	return http.Cookie{
		Name:    webKeyCookieName,
		Value:   user.WebKey,
		Expires: time.Now().Add(365 * 24 * time.Hour),
		Domain:  r.URL.Hostname(),
	}
}

// sendInitData - Send initial data to web user to sync their session
func sendInitData(ws *websocket.Conn, data *act.Data) {
	// prepare data
	dataBytes := make([]byte, 0)
	// send encounter
	if data != nil && data.Encounter.ID != 0 {
		encounterIDString := base36.Encode(uint64(data.Encounter.ID))
		log.Println("Send encounter data for", encounterIDString, "(TotalCombatants:", len(data.Combatants), ")")
		// add encounter
		dataBytes = append(dataBytes, act.EncodeEncounterBytes(&data.Encounter)...)
		// add combatants
		for _, combatant := range data.Combatants {
			dataBytes = append(dataBytes, act.EncodeCombatantBytes(&combatant)...)
		}
	}
	// add flag indicating if ACT is active
	isActiveFlag := act.Flag{
		Name:  "active",
		Value: data != nil && data.IsActive(),
	}
	dataBytes = append(dataBytes, act.EncodeFlagBytes(&isActiveFlag)...)
	// compress
	compressData, err := act.CompressBytes(dataBytes)
	if err != nil {
		log.Println("Error when compressing init data,", err)
		return
	}
	websocket.Message.Send(ws, compressData)
}