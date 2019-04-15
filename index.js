const pUrl = require('url')

const { config, proxy } = require('internal')

const needle = require('needle')

const ytdl = require('youtube-dl')

const defaults = {
	name: 'Mixcloud',
	prefix: 'mixcloud_',
	origin: '',
	endpoint: '',
	icon: 'https://www.mixcloud.com/media/images/www/global/mixcloud-og.png',
	categories: []
}

const phantom = require('phantom')

let loginData = {}

const headers = {
	'Accept': 'application/json, text/javascript, */*; q=0.01',
	'Origin': 'https://www.mixcloud.com',
	'Referer': 'https://www.mixcloud.com/',
	'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36'
}

function hasNumber(myString) {
	return /\d/.test(myString)
}

function toPoster(posters = {}, size) {
	if (size > 0) {
		let largeInt = 0
		let poster = null
		for (let key in posters)
			if (hasNumber(key) && parseInt(key) > largeInt) {
				largeInt = parseInt(key)
				poster = posters[key]
			}
		return poster
	} else {
		return posters['320wx320h'] || posters['medium'] || null
	}
}

function toHumanTime(sec_num) {
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    return hours+':'+minutes+':'+seconds;
}

let metas = []

function toMeta(obj) {
	const id = defaults.prefix + (obj.user || {}).username + '_' + obj.slug
	metas[id] = {
		id,
		poster: toPoster(obj.pictures, -1),
		posterShape: 'square',
		logo: toPoster(obj.pictures, -1),
		background: toPoster(obj.pictures, 1),
		name: obj.name,
		genres: (obj.tags || []).map(el => { return el.name }),
		runtime: toHumanTime(obj.audio_length),
		type: 'movie'
	}
	return metas[id]
}

const { addonBuilder, getInterface, getRouter } = require('stremio-addon-sdk')

const builder = new addonBuilder({
	"id": "org.stremio.soundcloud",
	"version": "1.0.0",

	"name": defaults.name,
	"description": "Tracks from Mixcloud",

	"icon": defaults.icon,

	"resources": [
	    "stream", "meta", "catalog"
	],

	"catalogs": [
	    {
	        id: "mixcloud",
	        name: defaults.name,
	        type: "music",
	        extra: [{ name: "search" }]
	    }
	],

	"types": ["music", "movie"],

	"idPrefixes": [ defaults.prefix ]

})

builder.defineCatalogHandler(args => {
    return new Promise((resolve, reject) => {
		metas = []
    	const src = (args.extra || {}).search
    	if (src)
    		needle.get('https://api.mixcloud.com/search/?q=' + encodeURIComponent(src).split('%20').join('+') + '&type=cloudcast', { headers }, (err, resp, body) => {
    			if ((((body || {}).data) || []).length)
    				resolve({ metas: body.data.map(toMeta) })
    			else
    				reject(defaults.name + ' - No valid response from search api')
    		})
    	else
    		needle.get('https://api.mixcloud.com/popular/hot/?type=cloudcast', { headers }, (err, resp, body) => {
    			if ((((body || {}).data) || []).length)
    				resolve({ metas: body.data.map(toMeta) })
    			else
    				reject(defaults.name + ' - No catalog response')
    		}) 
    })
})

builder.defineMetaHandler(args => {
    return new Promise((resolve, reject) => {
    	if (metas[args.id])
    		resolve({ meta: metas[args.id] })
    	else
    		reject(defaults.name + ' - Could not find meta for id: ' + args.id)
    })
})

builder.defineStreamHandler(args => {
	return new Promise((resolve, reject) => {

	    const video = ytdl('https://www.mixcloud.com/' + args.id.replace(defaults.prefix, '').split('_').map(el => encodeURIComponent(el)).join('/') + '/', ['-j'])

	    video.on('error', err => {
	        console.error(err || new Error(defaults.name + ' - Youtube-dl Error: Could Not Parse'))
	    })

	    video.on('info', info => {
	        if ((info.formats || []).length) {
	            const streams = []
	            info.formats.forEach(stream => {
	            	stream = stream || {}
	            	if (stream.url && stream.format_id)
	            		streams.push({
	            			title: stream.format_id,
	            			url: proxy.addProxy(stream.url, { headers: stream.http_headers })
	            		})
	            	if (streams.length)
	            		resolve({ streams })
	            	else
	            		reject(defaults.name + ' - No streams for id: ' + args.id)
	            })
	        } else if (info.url) {
	        	resolve({ streams: [{ url: proxy.addProxy(info.url, { headers: info.http_headers }), title: 'Stream' }] })
	        } else
	            reject(defaults.name + ' - Youtube-dl Error: No URL in Response')
	    })
	})
})

const addonInterface = getInterface(builder)

module.exports = getRouter(addonInterface)
