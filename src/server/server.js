var express = require("express"),
app = express(),
bodyParser = require("body-parser"),
methodOverride = require("method-override");

const NodeCache = require( "node-cache" );
const myCache = new NodeCache();

const cors = require("cors");

app.use(bodyParser.urlencoded({
		extended: false
	}));
app.use(bodyParser.json());
app.use(methodOverride());

app.use(cors());

var router = express.Router();
var request = require('request');
var apiML = "https://api.mercadolibre.com"

/*******************************************************/
/******************** SEARCH LIST **********************/
/*******************************************************/

var quantityOfResults = 4;

router.get('/api/items', function (req, res) {

	var cacheKey = "search/" + req.query.q;
	var cached = validateCache(cacheKey);

	if(cached !== false){
		res.send(cached);
		return;
	}

	request.get({
		"headers": {
			"content-type": "application/json"
		},
		"url": apiML + "/sites/MLA/search?q=" + req.query.q
	}, (error, response, body) => {
		if (error) {
			return console.dir(error);
		}
		var responseData = parseResultsList(JSON.parse(body));
		myCache.set( cacheKey, responseData);
		res.send(responseData);
	});
});

function parseResultsList(response) {
	var responseParsed = {
		"author": {
			"name": "author_name",
			"lastname": "author_lastname"
		},
		categories: [],
		items: []
	};

	var categories = response.filters.map(function(item) {
		if(item.id === "category") {
			return item;
		}
	});

	if(categories.length > 0 && categories[0].values.length > 0)
	{
		responseParsed.categories = categories[0].values[0].path_from_root.map(function(item){
			return item.name;
		});
	}

	for (var i = 0; i < response.results.length && i < quantityOfResults; i++) {

		var newItem = response.results[i];

		responseParsed.items.push({
			"id": newItem.id,
			"title": newItem.title,
			"price": {
				"currency": newItem.currency_id,
				"amount": Math.floor(newItem.price),
				"decimals": Math.round(newItem.price % 1 * 100)
			},
			"picture": newItem.thumbnail,
			"condition": newItem.condition,
			"free_shipping": newItem.shipping.free_shipping,
			"location": newItem.address.state_name
		});
	}
	
	return responseParsed;
}

/*******************************************************/
/*********************** ITEMS *************************/
/*******************************************************/

function getGeneralItemData(itemID) {
	var url = apiML + "/items/" + itemID;
	return createItemRequest(url);
};

function getDescriptionItemData(itemID) {
	var url = apiML + "/items/" + itemID + "/description";
	return createItemRequest(url);
};

function parseGeneralData(data) {
	return {
		id: data.id,
		title: data.title,
		price: {
			currency: data.currency_id,
			amount: Math.floor(data.price),
			decimals: Math.round(data.price % 1 * 100)
		},
		picture: data.pictures[0].url,
		condition: data.condition,
		free_shipping: data.shipping.free_shipping,
		sold_quantity: data.sold_quantity
	};
};


router.get('/api/items/:id', function(req, res) {
	var cacheKey = "item/" + req.params.id;
	var cached = validateCache(cacheKey);

	if(cached !== false){
		res.send(cached);
		return;
	}

	Promise.all([getGeneralItemData(req.params.id), getDescriptionItemData(req.params.id)])
	.then(([generalResults, descriptionResult]) => {
		var parsedGeneralData = parseGeneralData(generalResults);
		parsedGeneralData.description = descriptionResult.plain_text;

		var itemCategoryUrl = apiML + "/categories/" + generalResults.category_id;
		createItemRequest(itemCategoryUrl)
		.then(function(response){
			parsedGeneralData.categories = response.path_from_root.map(function(item, index){ return item.name });
			myCache.set( cacheKey, parsedGeneralData);
			res.send(parsedGeneralData);
		});
	})
	.catch(err => res.send(err))
});

/*******************************************************/
/*******************************************************/
/*******************************************************/

function createItemRequest(url){
	return new Promise((resolve, reject) => {
    	request.get({
			"headers": {
				"content-type": "application/json"
			},
			"url": url
		}, (error, response, body) => {
			if (error) {
				reject(error);
			} else {
				resolve(JSON.parse(body));	
			}
		});
	});
};

function validateCache(cacheKey) {
	var cached = myCache.get(cacheKey);
	if(cached !== undefined) {
		return cached;
	} else {
		return false;
	}
}

/*******************************************************/
/*******************************************************/
/*******************************************************/

app.use(router);

app.listen(3000, function () { 
	console.log("Node server running on http://localhost:3000");
});