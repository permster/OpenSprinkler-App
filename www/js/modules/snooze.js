/* global $, OSApp */

/* Per-station snooze (custom addition for firmware with the /sz and /jz commands)
 *
 * Firmware side (ospi-custom branch):
 *   /jz?pw=            -> {"snooze":[seconds left per station],"until":[UTC epoch per station]}
 *   /sz?pw=&sid=&t=    -> snooze station sid (0-based) for t minutes; t=0 clears
 * A snoozed station is skipped by scheduled programs only; manual runs still water it.
 *
 * This module is self-contained: it adds a snooze line and a snooze button to each
 * station card on the home page and does nothing on firmware without /jz.
 */

var OSApp = OSApp || {};
OSApp.Snooze = OSApp.Snooze || {};

( function() {
	var state = {
			supported: null,      // null = unknown, true/false after the first /jz call
			until: [],            // UTC epoch seconds per station (0 = not snoozed)
			fetching: false,
			lastFetch: 0
		},
		MIN_FETCH_INTERVAL = 5000,
		SNOOZE_MAX_MINUTES = 30 * 24 * 60;


	function t( text ) {
		return OSApp.Language && OSApp.Language._ ? OSApp.Language._( text ) : text;
	}

	function nowSec() {
		return Math.floor( Date.now() / 1000 );
	}

	OSApp.Snooze.remaining = function( sid ) {
		var until = state.until[ sid ] || 0;
		return until > nowSec() ? until - nowSec() : 0;
	};

	OSApp.Snooze.isSnoozed = function( sid ) {
		return OSApp.Snooze.remaining( sid ) > 0;
	};

	function formatRemaining( sec ) {
		var d = Math.floor( sec / 86400 ),
			h = Math.floor( ( sec % 86400 ) / 3600 ),
			m = Math.floor( ( sec % 3600 ) / 60 ),
			parts = [];
		if ( d ) { parts.push( d + "d" ); }
		if ( h ) { parts.push( h + "h" ); }
		if ( !d && ( m || !h ) ) { parts.push( Math.max( m, sec > 0 ? 1 : 0 ) + "m" ); }
		return parts.join( " " );
	}

	function formatUntil( epoch ) {
		var date = new Date( epoch * 1000 ),
			sameDay = date.toDateString() === new Date().toDateString(),
			time = date.toLocaleTimeString( [], { hour: "numeric", minute: "2-digit" } );
		return sameDay ? time : date.toLocaleDateString( [], { weekday: "short", month: "short", day: "numeric" } ) + " " + time;
	}

	function addStyles() {
		if ( document.getElementById( "snooze-styles" ) ) { return; }
		var css =
			".card .snooze-line{margin:.2em 0 0;font-size:.85em;font-weight:600;color:#b45309}" +
			".ui-page-theme-b .card .snooze-line,.dark .card .snooze-line{color:#fbbf24}" +
			".card .snooze-btn{position:absolute;right:2.9em;top:.4em;left:auto;bottom:auto;margin:0;padding:.1em .45em;" +
			"font-size:.75em;line-height:1.4;border-radius:1em;border:1px solid rgba(128,128,128,.45);" +
			"background:transparent;color:inherit;cursor:pointer;opacity:.75}" +
			".card .snooze-btn:hover,.card .snooze-btn:focus{opacity:1}" +
			".card .snooze-btn.active{border-color:#d97706;color:#d97706;opacity:1}" +
			".card.snoozed .ui-body{box-shadow:inset 0 0 0 2px rgba(217,119,6,.55)}" +
			".card > .ui-body{position:relative}" +
			"#snooze-unsupported{margin:.5em auto;max-width:44em;padding:.6em .8em;border-radius:.4em;" +
			"background:rgba(217,119,6,.15);border:1px solid #d97706;font-weight:600}";
		$( "<style id='snooze-styles'></style>" ).text( css ).appendTo( "head" );
	}

	// Draw/refresh the snooze line and button on every station card currently on screen
	OSApp.Snooze.render = function() {
		addStyles();
		var list = $( "#os-stations-list" ),
			banner = $( "#snooze-unsupported" );

		if ( state.supported === false ) {
			$( "#os-stations-list .snooze-btn, #os-stations-list .snooze-line" ).remove();
			$( "#os-stations-list .card.snoozed" ).removeClass( "snoozed" );
			if ( list.length && !banner.length ) {
				$( "<p id='snooze-unsupported' class='center' role='alert'></p>" ).text(
					"\u26A0 " + t( "Custom firmware features unavailable: this controller's firmware does not support zone snooze. " +
					"Official firmware may have been installed over the custom build." )
				).insertBefore( list );
			}
			return;
		}
		banner.remove();
		if ( !state.supported ) { return; }

		$( "#os-stations-list .card[data-station]" ).each( function() {
			var card = $( this ),
				sid = parseInt( card.attr( "data-station" ), 10 ),
				body = card.children( ".ui-body" ).first(),
				isMaster = OSApp.Stations && OSApp.Stations.isMaster && OSApp.Stations.isMaster( sid ),
				rem = OSApp.Snooze.remaining( sid ),
				line = body.children( ".snooze-line" ),
				btn = body.children( ".snooze-btn" );

			if ( isNaN( sid ) || !body.length ) { return; }

			if ( isMaster ) {
				line.remove();
				btn.remove();
				card.removeClass( "snoozed" );
				return;
			}

			if ( !btn.length ) {
				btn = $( "<button type='button' class='snooze-btn' data-role='none'></button>" ).appendTo( body );
			}

			if ( rem > 0 ) {
				var text = "\uD83D\uDCA4 " + t( "Snoozed" ) + " \u2013 " + formatRemaining( rem ) + " " + t( "left" ) +
					" (" + t( "until" ) + " " + formatUntil( state.until[ sid ] ) + ")";
				if ( !line.length ) {
					line = $( "<p class='snooze-line center' role='status'></p>" ).insertAfter( body.children( ".station-name" ) );
				}
				line.text( text );
				btn.text( "\uD83D\uDCA4 " + formatRemaining( rem ) ).addClass( "active" )
					.attr( { title: t( "Snoozed" ) + " " + t( "until" ) + " " + formatUntil( state.until[ sid ] ), "aria-label": t( "Change or cancel snooze" ) } );
				card.addClass( "snoozed" );
			} else {
				line.remove();
				btn.text( "\uD83D\uDCA4" ).removeClass( "active" )
					.attr( { title: t( "Snooze this zone" ), "aria-label": t( "Snooze this zone" ) } );
				card.removeClass( "snoozed" );
			}
		} );
	};

	OSApp.Snooze.refresh = function( force ) {
		if ( state.supported === false || state.fetching || !OSApp.currentSession ||
			!OSApp.currentSession.isControllerConnected || !OSApp.currentSession.isControllerConnected() ) {
			OSApp.Snooze.render();
			return $.Deferred().resolve().promise();
		}
		if ( !force && Date.now() - state.lastFetch < MIN_FETCH_INTERVAL ) {
			OSApp.Snooze.render();
			return $.Deferred().resolve().promise();
		}

		state.fetching = true;
		return OSApp.Firmware.sendToOS( "/jz?pw=", "json", { suppressFirmwareError: true } ).then( function( data ) {
			state.fetching = false;
			state.lastFetch = Date.now();
			if ( data && $.isArray( data.until ) ) {
				state.supported = true;
				state.until = data.until.map( function( v ) { return parseInt( v, 10 ) || 0; } );
			} else {
				state.supported = false;
			}
			OSApp.Snooze.render();
		}, function( xhr ) {
			state.fetching = false;
			state.lastFetch = Date.now();
			// 404 / "page not found" = this controller's firmware has no snooze support
			// (e.g. official firmware was installed over the custom build): warn, don't retry
			if ( xhr && xhr.status === 404 ) {
				state.supported = false;
				state.until = [];
				OSApp.Snooze.render();
			}
		} );
	};

	OSApp.Snooze.set = function( sid, minutes ) {
		return OSApp.Firmware.sendToOS( "/sz?sid=" + sid + "&t=" + minutes + "&pw=", "json" ).done( function() {
			state.until[ sid ] = minutes > 0 ? nowSec() + minutes * 60 : 0;
			OSApp.Snooze.render();
			OSApp.Errors.showError( minutes > 0 ?
				t( "Zone snoozed" ) + ": " + formatRemaining( minutes * 60 ) :
				t( "Snooze cancelled" ) );
			// snoozing stops a running/queued zone, so refresh the whole status too
			OSApp.Status.refreshStatus();
		} );
	};

	// Same duration picker as "manually run": days / hours / minutes, starting now.
	// 0 clears the snooze. The firmware works in whole minutes (max 30 days).
	OSApp.Snooze.showPopup = function( sid ) {
		var name = OSApp.Stations.getName( sid ),
			rem = OSApp.Snooze.remaining( sid ),
			help = rem > 0 ?
				"\uD83D\uDCA4 " + t( "Snoozed" ) + " " + t( "until" ) + " " + formatUntil( state.until[ sid ] ) + ". " +
					t( "Enter a new snooze duration starting now, or 0 to cancel the snooze." ) :
				t( "Enter a duration to skip" ) + " " + name + " " + t( "in scheduled programs, starting now." );

		OSApp.UIDom.showDurationBox( {
			title: t( "Snooze" ) + " " + name,
			incrementalUpdate: false,
			preventCompression: true,
			granularity: 1,
			maximum: SNOOZE_MAX_MINUTES * 60,
			seconds: rem > 0 ? Math.ceil( rem / 60 ) * 60 : 0,
			helptext: help,
			callback: function( seconds ) {
				var minutes = Math.ceil( ( parseInt( seconds, 10 ) || 0 ) / 60 );
				if ( minutes === 0 && rem <= 0 ) { return; }
				OSApp.Snooze.set( sid, Math.min( minutes, SNOOZE_MAX_MINUTES ) );
			}
		} );
	};

	// Snooze button on a card: open the popup instead of the card's run/stop dialog.
	// Captured on the way down, because the dashboard's own .card click handler sits
	// closer to the button and would otherwise open the run dialog first.
	document.addEventListener( "click", function( e ) {
		var btn = e.target && e.target.closest ? e.target.closest( "#os-stations-list .card .snooze-btn" ) : null;
		if ( !btn ) { return; }
		e.preventDefault();
		e.stopPropagation();
		var sid = parseInt( $( btn ).closest( ".card" ).attr( "data-station" ), 10 );
		if ( !isNaN( sid ) ) { OSApp.Snooze.showPopup( sid ); }
	}, true );

	// Refresh after every controller data refresh, and when the home page is shown.
	// The dashboard redraws its cards on the same event, so render after it (setTimeout).
	$( "html" ).on( "datarefresh", function() {
		setTimeout( function() { OSApp.Snooze.refresh( false ); }, 0 );
	} );
	$( document ).on( "pagecontainershow", function( e, ui ) {
		if ( ui && ui.toPage && ui.toPage.attr( "id" ) === "sprinklers" ) {
			setTimeout( function() { OSApp.Snooze.refresh( true ); }, 0 );
		}
	} );

	// Keep the countdown text current between refreshes
	setInterval( function() {
		if ( state.supported && $( "#sprinklers" ).hasClass( "ui-page-active" ) ) { OSApp.Snooze.render(); }
	}, 30000 );
} )();
