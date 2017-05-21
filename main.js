// to-do
//   - prevent inefficient but harmless extra sync function call
//   - cache value instead of require("preferences-service") in event listener?
//   - enable "close tab" context menu item (meh)
//   - enable "close tab" X button (meh)
//   - store "browser" object during onTrack instead of re-reading on the fly 
//      (how inefficient?)
//   - force browser.tabs.closeWindowWithLastTab always!? 
//      meh if people are messing with about:config, it's their problem...
//   - fix validation warning about harness-options.json?
//      https://bugzilla.mozilla.org/show_bug.cgi?id=856475

// references for the private browsing fix (entirely via package.json)
// - http://blog.mozilla.org/addons/2013/02/26/
// - <https://addons.mozilla.org/en-US/developers/docs/sdk/latest/modules/sdk/
//    private-    browsing.html>


// deployment notes
//  - install.rdf: tweak version name to my liking
//  - AMO: min firefox version 13 (SDK 1.14 breaks firefox 12 support altogether)
//  - harness-options.json
//    - change version string (is there a point?)
//    - set SHA256 to null; must have been invalidated by repacking anyway
// 


// -----------------------------------------------------------------------
// Part 0: "wrap loose variables in namespace" 

// https://developer.mozilla.org/en-US/docs/XUL_School/JavaScript_Object_Management
// http://elegantcode.com/2011/01/26/basic-javascript-part-8-namespaces/
if (typeof ypeels == "undefined")  {
    var ypeels = {};
}

if (typeof ypeels.isTB == "undefined") {
    // "STEEL is the Scriptable Thunderbird Easy Extension Library."
    // https://developer.mozilla.org/en-US/docs/Mozilla/Tech/Toolkit_API/STEEL
    let { Cc, Ci } = require("chrome");
    ypeels.isTB = Cc["@mozilla.org/steel/application;1"];
}

if (typeof ypeels.closeLastTab == "undefined") {
    ypeels.closeLastTab = {};
}

if (typeof ypeels.closeLastTab.prefs == "undefined") {
    ypeels.closeLastTab.prefs = {};
}

if (typeof ypeels.closeLastTab.core == "undefined") {
    ypeels.closeLastTab.core = {};
}

if (typeof ypeels.debug == "undefined") {
    ypeels.debug = {}
    ypeels.debug.debugOn = false;
    
    if (ypeels.debug.debugOn) {        
        if (ypeels.isTB) {
            // http://stackoverflow.com/questions/16686888/thunderbird-extension-console-logging
            let { Cc, Ci } = require("chrome");
            let Application = Cc["@mozilla.org/steel/application;1"].getService(Ci.steelIApplication);
            ypeels.debug.log = Application.console.log;
        } else {        
            // https://developer.mozilla.org/en-US/docs/Error_Console - devtools.errorconsole.enabled
            ypeels.debug.log = console.error;
        }
    } else {
        ypeels.debug.log = function(x) {}
    }
}






// -----------------------------------------------------------------------
// Part 1: about:config / browser.tabs.closeWindowWithLastTab
// USER controls about:config pref personally - not my problem anymore
//
// https://addons.mozilla.org/en-US/developers/docs/sdk/latest/packages/addon-kit/simple-prefs.html
// - lacks a LOT of documentation...
//
// unused: observer-service
//
// current implementation
//  - respect user's setting (any change I make is RETAINED on uninstall!)
//  - expose as an Option and let user deal with the consequences!!
//
// current inefficiency: each sync function gets called after the other
// - this is because programmatic and user changes are indistinguishable!
// - harmless since the write-back does not modify (no infinite loop)
//
// current limitation: only 1 preference is supported


// should match packages.json in Properties (Add-on Builder)...?
ypeels.closeLastTab.prefs.internalName = 
    "extensions_ypeels_closeWindowWithLastTab";

// Preference Name from about:config = "browser.tabs.closeWindowWithLastTab"
ypeels.closeLastTab.prefs.aboutConfigPref = "closeWindowWithLastTab";

ypeels.closeLastTab.prefs.aboutConfigBranch = function() {
    if (ypeels.isTB)
        return "mail.tabs.";
    else
        return "browser.tabs.";
}

ypeels.closeLastTab.prefs.aboutConfigName = function () {
    return ( // parentheses required? a javascript quirk?
        ypeels.closeLastTab.prefs.aboutConfigBranch() +
        ypeels.closeLastTab.prefs.aboutConfigPref
    );
}



// 1-way sync function: copy about:addons to about:config
// - called when the checkbox in about:addons is toggled.
ypeels.closeLastTab.prefs.copyAddonsToConfig = function(addonsPref) {  

    ypeels.debug.log("copyAddonsToConfig");
    require('sdk/preferences/service').set(
        ypeels.closeLastTab.prefs.aboutConfigName(),
        require('sdk/simple-prefs').prefs[addonsPref]
    ); 
 
/*    
    // caching version: currently defunct (see Main Event)
    // 1. Read pref from about:addons (and write to cache for event listener)
    // Pref is defined in package.json (Properties in Add-on Builder)
    // this avoids calling require(.) inside event listener.
    ypeels.closeLastTab.prefs.cached_closeWindowWithLastTab = 
        require('sdk/simple-prefs').prefs[prefName];
        
    // 2. Write pref to about:config
    require('sdk/preferences/service').set(
        ypeels.closeLastTab.prefs.aboutConfigName, 
        ypeels.closeLastTab.prefs.cached_closeWindowWithLastTab
    );
    
    console.log('onprefchange!');
*/  
}



// 1-way sync function: copy about:config to about:addons
// - called when browser.tabs.closeWindowWithLastTab
ypeels.closeLastTab.prefs.copyConfigToAddons = function(configPref) {
    
    ypeels.debug.log("copyConfigToAddons");
    require('sdk/simple-prefs').prefs[ypeels.closeLastTab.prefs.internalName] = 
        require('sdk/preferences/service').get(configPref);
    // cache version - currently defunct (see Main Event)
    //ypeels.closeLastTab.prefs.cached_closeWindowWithLastTab = 
    //    require("preferences-service").get(ypeels.closeLastTab.prefs.aboutConfigName);
    //require('simple-prefs').prefs[ypeels.closeLastTab.prefs.internalName] = 
    //    ypeels.closeLastTab.prefs.cached_closeWindowWithLastTab;
}

  

// Preference observer ("controller") that performs config=>addons sync
// https://developer.mozilla.org/en-US/docs/Code_snippets/Preferences#Using_preference_observers
ypeels.closeLastTab.prefs.myPrefObserver = {
    register: function() {
    
        // Can't call Components.classes directly?
        // http://forums.mozillazine.org/viewtopic.php?f=19&t=2312429 AND
        // resources/api-utils/lib/preferences-service.js
        const {Cc,Ci,Cr} = require("chrome");
        const prefService = Cc["@mozilla.org/preferences-service;1"].
                getService(Ci.nsIPrefService);

        // For this._branch we ask that the preferences for 
        // extensions.myextension. and children [sic]
        this._branch = prefService.getBranch(ypeels.closeLastTab.prefs.aboutConfigBranch());
        
        // Now we queue the interface called nsIPrefBranch 2:
        // "nsIPrefBranch 2 allows clients to observe changes to pref values."
        // 6/4/2013: changed to nsIPrefBranch for SDK 1.14/Fx 13
        // - https://bugzilla.mozilla.org/show_bug.cgi?id=718255
        this._branch.QueryInterface(Ci.nsIPrefBranch);
        
        // Finally add the observer.
        this._branch.addObserver("", this, false);
        
        // Final cleanup for about:addons <-- about:config sync
        // Unlike simple-prefs, this preference observer won't auto-deregister
        // resources/addon-kit/lib/simple-prefs.js
        const { when: unload } = require("sdk/system/unload");
        unload(function() { ypeels.closeLastTab.prefs.myPrefObserver.unregister(); });
        
        ypeels.debug.log("pref observer registered");
    },
    
    unregister: function() {
        if (!this._branch) return; // hmmmmmmm
        this._branch.removeObserver("", this);
        ypeels.debug.log("pref observer unregistered");
    },
    
    observe: function(aSubject, aTopic, aData) {
        if(aTopic == "nsPref:changed") {
    
            // aSubject is the nsIPrefBranch we're observing (after appropriate QI)
            // aData is the name of the pref that's been changed (relative to aSubject)
            if (aData == ypeels.closeLastTab.prefs.aboutConfigPref) {
                ypeels.closeLastTab.prefs.copyConfigToAddons(ypeels.closeLastTab.prefs.aboutConfigName());
            }  
            ypeels.debug.log("OBSERVED!!!");
        } 
    }
} // myPrefObserver




// Initialize about:addons checkbox
// https://github.com/canuckistani/sdk-simple-prefs/blob/65b3a5b0ecf4adae3e8064d5c98b78361376c73d/lib/main.js
// simplePrefs["myPrefName"] = prefService.get("browser.tabs.closeWindowWithLastTab");
ypeels.closeLastTab.prefs.copyConfigToAddons(
    ypeels.closeLastTab.prefs.aboutConfigName()
);

// Wire up sync: about:addons --> about:config
require('sdk/simple-prefs').on(
    ypeels.closeLastTab.prefs.internalName, 
    ypeels.closeLastTab.prefs.copyAddonsToConfig
);  

// Wire up sync: about:addons <-- about:config
ypeels.closeLastTab.prefs.myPrefObserver.register();



// -----------------------------------------------------------------------
// Part 2: core functionality: now with correct garbage collection of event listener

// Firefox 31: middle-click to close last tab is now built-in! 
if (ypeels.isTB) {


// ===========================================================================
// The Event Listener: kill last tab on middle click, if about:config allows
// ===========================================================================
// https://addons.mozilla.org/en-US/developers/docs/sdk/latest/packages/addon-kit/windows.html
// https://addons.mozilla.org/firefox/downloads/latest/360544/addon-360544-latest.xpi?src=search
ypeels.closeLastTab.core.onClickTabContainer = function(event) {

    // condition 1: middle-click on tab (not on 'tabs', the adjacent empty space)
    if (event.which == 2 && event.target.tagName == 'tab') {     

        // condition 2: tab's owning window has only one tab
        if (ypeels.closeLastTab.core.hasOnlyOneTab(event.target)) {
        
            // condition 3: about::config / browser.tabs.closeWindowWithLastTab
            // - when false, removeTab() gives "TypeError: browser is null"
            // - thanks to Kris Maglione
            
            // version 3a: cache - (not fully synced with about:config...)
            //if (ypeels.closeLastTab.prefs.cached_closeWindowWithLastTab) {            
            
            // version 3b: no stale cache, but slow performance???
            if (require('sdk/preferences/service').get(ypeels.closeLastTab.prefs.aboutConfigName())) {
            
                // kill tab ONLY if 3 conditions above are fulfilled.                
                ypeels.closeLastTab.core.killWindow(event.target);
                
                // Kris Maglione's suggestion
                // hmm, this is kind of aggressive?
                // - the "TypeError" error no longer occurs now
                // - what if Firefox or other addon needs to handle the event?
                // - keep it conservative for now - see what next reviewer says
                // https://developer.mozilla.org/en-US/docs/DOM/event.preventDefault
                // https://developer.mozilla.org/en-US/docs/DOM/event.stopPropagation
                //event.preventDefault();
                //event.stopPropagation();
            }
        }        
    }        
}

ypeels.closeLastTab.core.hasOnlyOneTab = function(target) {
    // get CLICKED window's "g Browser" for the main event
    // thanks to Kris Maglione: don't need to call require("window- utils")!
    //var browser = require("window- utils").activeBrowserWindow.g Browser;
    //var browser = event.target.ownerDocument.defaultView.gBrowser;
    if (ypeels.isTB)
        var mainWindow = target.ownerDocument.getElementById('tabmail');
    else
        var mainWindow = target.ownerDocument.defaultView.gBrowser;
    
    if (mainWindow.tabContainer.childNodes.length == 1) {
    
        // condition 2b: it wasn't the penultimate tab that was middle-clicked (thunderbird-only quirk)
        // https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/tab FINALLY found something that works
        if (ypeels.isTB)
            return target.selected;
        else
            return true;
            
    } else {
        return false;
    }
}

ypeels.closeLastTab.core.killWindow = function(target) {
    let document = target.ownerDocument;
    if (ypeels.isTB) {
        // http://stackoverflow.com/questions/223991/
        let tbWindow = 
            document.parentWindow ? 
            document.parentWindow : 
            document.defaultView;
        tbWindow.close();
    } else {
        document.defaultView.gBrowser.removeTab(target);
    }
    ypeels.debug.log("DIE!");
}



ypeels.closeLastTab.core.getTabContainer = function(window) {
    if (ypeels.isTB)
        return window.document.getElementById('tabmail').tabContainer;
    else
        return window.gBrowser.mTabContainer;
}

ypeels.closeLastTab.core.mainWindowURI = function() {
    if (ypeels.isTB)
        return "chrome://messenger/content/messenger.xul";
    else
        return "chrome://browser/content/browser.xul";
}

// The following object will install the event listener on every window 
// note that non-intuitively, EACH window has a distinct g Browser member)
ypeels.closeLastTab.core.tracker = new require('sdk/deprecated/window-utils').WindowTracker({

    onTrack: function(window) {
    
        // from https://addons.mozilla.org/firefox/downloads/latest/360544/addon-360544-latest.xpi?src=search
        // make sure we have a main browser window.
        if (ypeels.closeLastTab.core.mainWindowURI() != window.location) 
            return;        
        
        // my contribution (mutated from overlay.js in my old restart-required extension)
        // from https://addons.mozilla.org/firefox/downloads/latest/360544/addon-360544-latest.xpi?src=search
        // see also https://developer.mozilla.org/en-US/docs/DOM/element.addEventListener
        // obtain "gBrowser" equivalent for backwards compatibility of old main one-liner
        // use the gBrowser object for the CURRENT WINDOW
        ypeels.closeLastTab.core.getTabContainer(window).addEventListener(
            'click', 
            ypeels.closeLastTab.core.onClickTabContainer
        );
        //console.log("ypeels onTrack done");

    }, // need this comma! hours tracking down a stupid syntax error...
    
    // undo antics of onTrack - for restartless goodness
    // http://stackoverflow.com/questions/10363708/firefox-sdk-keydown-keyup-events
    onUntrack: function(window) {
        if (ypeels.closeLastTab.core.mainWindowURI() != window.location) 
            return; 
            
        ypeels.closeLastTab.core.getTabContainer(window).removeEventListener(
            'click', 
            ypeels.closeLastTab.core.onClickTabContainer
        );
        
        //console.log("ypeels onUntrack done");
    }
    
    // can't add additional functions to this object? WindowTracker is that picky?
    
});







} // if isTB

