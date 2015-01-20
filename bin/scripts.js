"use strict";
//Config loggin level
var logger = require('winston');
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
	level: 'debug',
	colorize: true,
	timestamp: true
});

var path = require('path');
var fs = require('fs');
var request = require('request');
var https = require('https');
var exec = require('child_process').exec;

var CONFIG_PATH = path.join(process.cwd(), 'crowdin.json')
var crowdin = require(CONFIG_PATH);

/******* PRIVATE METHODS *******/
function refreshTranslations(callback) {
	logger.debug("Refreshing translation.");
	var opts = {
		uri: 'https://crowdin.com/api/project/' + crowdin.projectId + '/export',
		qs: {
			key: crowdin.apiKey
		}
	};
	request(opts, function(error, response, body) {
		if (response.statusCode == 200) {
			logger.info("Translations refreshed");
		} else {
			logger.error('error: ' + response.statusCode);
			logger.error(body);
		}
		callback(error);
	});
}

function downloadTranslations(callback) {
	logger.debug("Downloading translation.");
	var options = {
		hostname: 'crowdin.com',
		port: 443,
		path: '/api/project/' + crowdin.projectId + '/download/all.zip?key=' + crowdin.apiKey,
		method: 'GET'
	};

	var req = https.request(options, function(res) {
		res.on('data', function(chunk) {
			fs.appendFileSync('./all.zip', chunk);
		});
		res.on('end', function(error) {
			if (!error) {
				logger.info("Translations Dowloaded.");
			}
			callback(error);
		});
	});
	req.on('error', function(e) {
		logger.error('problem with request: ' + e.message);
	});
	req.end();
}

function uploadKeys() {
	logger.debug('Uploading traductions...');
	var formData = {
		'files[keys.po]': fs.createReadStream('./i18n/keys.po')
	};
	request.post({
		url: 'https://crowdin.com/api/project/' + crowdin.projectId + '/add-file?key=' + crowdin.apiKey,
		formData: formData
	}, function(err, response, body) {
		if (err) {
			logger.error('Upload failed.', err);
		} else {
			logger.info('Traductions uploaded successfully!');
		}
	});
}

function upgradeKeys() {
	logger.debug('Uploading traductions...');
	var formData = {
		'files[keys.po]': fs.createReadStream('./i18n/keys.po')
	};
	request.post({
		url: 'https://crowdin.com/api/project/' + crowdin.projectId + '/update-file?key=' + crowdin.apiKey,
		formData: formData
	}, function(err, response, body) {
		if (err) {
			logger.error('Upload failed.', err);
		} else {
			logger.info('Traductions uploaded successfully!');
		}
	});
}

function mergeTranslations(callback) {
	logger.error('Mergin Translations. IMPLEMENT ME!');
	callback();
}

function initPaths() {
	logger.info('Initializing...');
	if (!fs.existsSync('./i18n')) {
		fs.mkdirSync('./i18n');
	}
	if (fs.existsSync('./i18n/keys.po')) {
		fs.truncateSync('./i18n/keys.po', 0);
	} else {
		fs.writeFileSync('./i18n/keys.po', ' ');
	}
}


function removeDirectory(path) {
	exec('rm -rf ' + path, function(err) {
		if (err) {
			logger.warn("Error removing " + path + ". " + err);
		}
	});
}

function cleanOldTranslations(callback) {
	fs.unlink('./all.zip', function(error) {
		if (!error || error.code === 'ENOENT') {
			var files = fs.readdirSync('./i18n');
			files.map(function(file) {
				return path.join('./i18n', file);
			}).forEach(function(file) {
				var stats = fs.statSync(file);
				if (stats.isDirectory()) {
					removeDirectory(file);
				}
			});
			callback();
		} else {
			callback(error);
		}
	});
}

function unzipTranslations(callback) {
	logger.debug("Unziping.");
	exec('unzip ./all.zip -d i18n',
		function(error) {
			if (error !== null) {
				logger.error('exec error: ' + error);
			}
			callback();
		});
}

function endsWith(str, suffix) {
	return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function getKeys(file) {
	logger.debug("Getting tranlations from file: " + file);
	exec('xgettext -j --from-code=UTF-8 --force-po --no-wrap -ktr:1 -ktrd:1 -ktrn:1,2 -ktrnd:1,2 -o i18n/keys.po -LJavaScript ' + file,
		function(error) {
			if (error !== null) {
				logger.error('exec error: ' + error);
			}
		});
}

function scandDirectory(directory, callback) {
	logger.debug("Scaning " + directory + " for keys.");
	// find . -iname "*.js" | xargs xgettext -j --from-code=UTF-8 --force-po --no-wrap -ktr:1 -ktrd:1 -ktrn:1,2 -ktrnd:1,2 -o i18n/keys.po -LJavaScript
	exec('find ' + directory + ' -iname "*.js" | xargs xgettext -j --from-code=UTF-8 --force-po --no-wrap -ktr:1 -ktrd:1 -ktrn:1,2 -ktrnd:1,2 -o i18n/keys.po -LJavaScript',
		function(error) {
			if (error !== null) {
				logger.warn("Error scaning directory " + directory)
			}
			callback(error);
		});
}

function gerateTranslationFile(callback) {
	initPaths();
	scandDirectory(crowdin.srcPath, callback);
}

/*******************************/
var createCrowdin = function() {
	gerateTranslationFile(function(error){
		if (!error) {
			uploadKeys();
		}
	});
};


var downloadCrowdin = function() {
	if (!fs.existsSync('./i18n')) {
		fs.mkdirSync('./i18n');
	}
	cleanOldTranslations(function(error) {
		if (error) {
			logger.error("Error cleaning up old translations." + error.code);
		} else {
			refreshTranslations(function(error) {
				if (error) {
					logger.error("Error refreshing translations.");
				} else {
					downloadTranslations(function(error) {
						if (error) {
							logger.error("Error dowloading translations.");
						} else {
							unzipTranslations(function(error) {
								if (error) {
									logger.error("Error Unziping translations" + error);
								} else {
									logger.info("Tranlations updated sucessfull!");
								}
							});
						}
					});
				}
			});
		}
	});
};

var uploadCrowdin = function(merge) {
	gerateTranslationFile(function(error){
		if (!error) {
			upgradeKeys();
		}
	});
};


module.exports.createCrowdin = createCrowdin;
module.exports.downloadCrowdin = downloadCrowdin;
module.exports.uploadCrowdin = uploadCrowdin;
module.exports.generateFile = gerateTranslationFile;
