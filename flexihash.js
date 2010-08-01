/**
 * A simple consistent hashing implementation with exchangeable hash algorithm for node.js
 *
 * @author Tobias Orterer <tobsn@php.net> (node.js conversion)
 * @author Paul Annesley (Original Author)
 * @package Flexihash
 * @licence http://www.opensource.org/licenses/mit-license.php
 */

/**
 * Requirements
 */
var 	sys 	= require( 'sys' ), 
	crypto 	= require( 'crypto' );

/**
 * Constructor
 * @param string hasher hash algorishm
 * @param int replicas Amount of positions to hash each target to.
 */
function flexihash( hasher, replicas ) {
	/**
	 * The number of positions to hash each target to
	 * @var int
	 */
	this._replicas = ( replicas != null ) ? replicas : 64;

	/**
	 * The hash algorithm - mostly md2, md4, md5, rmd160, sha or sha1 (crypto) or crc32 (build in default)
	 * @var string
	 */
	this._hasher = ( hasher != null ) ? (function( data ) { return crypto.createHash( hasher ).update(data).digest('hex') }) : (function( data ) { return this.__crc32( data ); });

	/**
	 * Internal counter for current number of targets
	 * @var this.int
	 */
	this._targetCount = 0;

	/**
	 * Internal map of positions (hash outputs) to targets
	 * @var this.object { position => target, ... }
	 */
	this._positionToTarget = {};

	/**
	 * Internal map of targets to lists of positions that target is hashed to.
	 * @var this.array { target => [ position, position, ... ], ... }
	 */
	this._targetToPositions = [];

	/**
	 * Whether the internal map of positions to targets is already sorted.
	 * @var this.boolean
	 */
	this._positionToTargetSorted = false;
}

/**
 * Add a target.
 * @param string target
 * @param float weight
 * @chainable
 */
flexihash.prototype.addTarget = function( target, weight ) {
	weight = ( weight != null ) ? weight : 1;

	if( typeof( this._targetToPositions[target] ) != 'undefined' ) {
		throw new Error( 'Target ' + this._targetToPositions[target] + ' already exists.' );
	}

	this._targetToPositions[target] = [];

	// hash the target into multiple positions
	for( i = 0; i < Math.round( this._replicas * weight ); i++ ) {
		position = this._hasher( target + i );
		this._positionToTarget[position] = target; // lookup
		this._targetToPositions[target].push( position ); // target removal
	}

	this._positionToTargetSorted = false;
	this._targetCount++;

	return this;
}

/**
 * Add a list of targets.
 * @param array targets
 * @param float weight
 * @chainable
 */
flexihash.prototype.addTargets = function( targets, weight ) {
	weight = ( weight != null ) ? weight : 1;
	for( target in targets ) {
		this.addTarget( targets[target], weight );
	}
	return this;
}

/**
 * Remove a target.
 * @param string target
 * @chainable
 */
flexihash.prototype.removeTarget = function( target ) {
	if( typeof( this._targetToPositions[target] ) == 'undefined' ) {
		throw new Error( 'Target ' + target + ' does not exist.' );
	}

	for( position in this._targetToPositions[target] ) {
		delete this._positionToTarget[this._targetToPositions[target][position]];
	}

	delete this._targetToPositions[target];

	this._targetCount--;

	return this;
}

/**
 * A list of all potential targets
 * @return array
 */
flexihash.prototype.getAllTargets = function() {
	var keys = [];
	for( key in this._targetToPositions ) {
		keys.push( key );
	}
	return keys;
}

/**
 * Looks up the target for the given resource.
 * @param string resource
 * @return string
 */
flexihash.prototype.lookup = function( resource ) {
	targets = this.lookupList( resource, 1 );
	if( targets.length < 1 ) {
		throw new Error( 'No targets exist' );
	}
	return targets[0];
}

/**
 * Get a list of targets for the resource, in order of precedence.
 * Up to requestedCount targets are returned, less if there are fewer in total.
 *
 * @param string resource
 * @param int requestedCount The length of the list to return
 * @return array List of targets
 */
flexihash.prototype.lookupList = function( resource, requestedCount ) {
	if( requestedCount == null || requestedCount < 1 ) {
		throw new Error( 'Invalid count requested' );
	}

	// handle no targets
	if( Object.keys(this._positionToTarget).length < 1 ) {
		return [];
	}

	// optimize single target
	if( this._targetCount == 1 ) {
		var tmp_arr = [];
		for( key in this._positionToTarget ) {
			tmp_arr.push( this._positionToTarget[key] );
		}
		return this.__uniqueArray( this.__arrayValues( tmp_arr ) );
	} 

	// hash resource to a position
	resourcePosition = this._hasher( resource );

	results = [];
	collect = false;
	this._sortPositionTargets();

	// search values above the resourcePosition
	for( key in this._positionToTarget ) {
		value = this._positionToTarget[key];

		// start collecting targets after passing resource position
		if( !collect && key > resourcePosition ) {
			collect = true;
		}

		// only collect the first instance of any target
		if( collect && !this.__inArray( value, results ) ) {
			results.push( value );
		}

		// return when enough results, or list exhausted
		if( results.length == requestedCount || results.length == this._targetCount ) {
			return results;
		}
	}

	// loop to start - search values below the resourcePosition
	for( key in this._positionToTarget ) {
		value = this._positionToTarget[key];
		if( !this.__inArray( value, results ) ) {
			results.push( value );
		}

		// return when enough results, or list exhausted
		if( results.length == requestedCount || results.length == this._targetCount ) {
			return results;
		}
	}

	// return results after iterating through both "parts"
	return results;
}

// ----------------------------------------
// private methods

/**
 * Sorts the internal mapping (positions to targets) by position
 */
flexihash.prototype._sortPositionTargets = function() {
	// sort by key (position) if not already
	if( !this._positionToTargetSorted ) {
		this.__kSort( this._positionToTarget );
		this._positionToTargetSorted = true;
	}
}

// ----------------------------------------
// added methods for node.js

/**
 * Removes duplicate values from array (phpjs.org)
 */
flexihash.prototype.__uniqueArray = function( input ) {
	var key = '', tmp_arr = {}, val = '';
	var __array_search = function( needle, haystack ) {
		var fkey = '';
		for( fkey in haystack ) {
			if( haystack.hasOwnProperty( fkey ) ) {
				if( ( haystack[fkey] + '' ) === ( needle + '' ) ) {
					return fkey;
				}
			}
		}
		return false;
	};
	for( key in input ) {
		if( input.hasOwnProperty( key ) ) {
			val = input[key];
			if( false === __array_search( val, tmp_arr ) ) {
				tmp_arr[key] = val;
			}
		}
	}
	return tmp_arr;
}

/**
 * Return just the values from the input array (phpjs.org)
 */
flexihash.prototype.__arrayValues = function( input ) {
	var tmp_arr = [], key = '';
	for( key in input ) {
		tmp_arr.push( input[key] );
	}
	return tmp_arr;
}

/**
 * Checks if the given value exists in the array (phpjs.org)
 */
flexihash.prototype.__inArray = function( needle, haystack ) {
	var key = '';
	for( key in haystack ) {
		if( haystack[key] == needle ) {
			return true;
		}
	}
	return false;
}

/**
 * Sort an array by key (phpjs.org)
 */
flexihash.prototype.__kSort = function( input ) {
	var tmp_arr={}, keys=[], sorter, i, k, populateArr = {};
	var sorter = function (a, b) {
		if (a > b) {
			return 1;
		}
		if (a < b) {
			return -1;
		}
		return 0;
	};

	// Make a list of key names
	for( k in input ) {
		if( input.hasOwnProperty( k ) ) {
			keys.push( k );
		}
	}
	keys.sort( sorter );

	// Rebuild array with sorted key names
	for( i = 0; i < keys.length; i++ ) {
		k = keys[i];
		tmp_arr[k] = input[k];
	}
	for( i in tmp_arr ) {
		if( tmp_arr.hasOwnProperty( i ) ) {
			populateArr[i] = tmp_arr[i];
		}
	}
	this._positionToTarget = populateArr;
}

/**
 * Calculate the crc32 polynomial of a string (phpjs.org)
 */
flexihash.prototype.__crc32 = function( input ) {
	var str = this.__utf8( input );
	var crc = 0, x = 0, y = 0, table = '00000000 77073096 EE0E612C 990951BA 076DC419 706AF48F E963A535 9E6495A3 0EDB8832 79DCB8A4 E0D5E91E 97D2D988 09B64C2B 7EB17CBD E7B82D07 90BF1D91 1DB71064 6AB020F2 F3B97148 84BE41DE 1ADAD47D 6DDDE4EB F4D4B551 83D385C7 136C9856 646BA8C0 FD62F97A 8A65C9EC 14015C4F 63066CD9 FA0F3D63 8D080DF5 3B6E20C8 4C69105E D56041E4 A2677172 3C03E4D1 4B04D447 D20D85FD A50AB56B 35B5A8FA 42B2986C DBBBC9D6 ACBCF940 32D86CE3 45DF5C75 DCD60DCF ABD13D59 26D930AC 51DE003A C8D75180 BFD06116 21B4F4B5 56B3C423 CFBA9599 B8BDA50F 2802B89E 5F058808 C60CD9B2 B10BE924 2F6F7C87 58684C11 C1611DAB B6662D3D 76DC4190 01DB7106 98D220BC EFD5102A 71B18589 06B6B51F 9FBFE4A5 E8B8D433 7807C9A2 0F00F934 9609A88E E10E9818 7F6A0DBB 086D3D2D 91646C97 E6635C01 6B6B51F4 1C6C6162 856530D8 F262004E 6C0695ED 1B01A57B 8208F4C1 F50FC457 65B0D9C6 12B7E950 8BBEB8EA FCB9887C 62DD1DDF 15DA2D49 8CD37CF3 FBD44C65 4DB26158 3AB551CE A3BC0074 D4BB30E2 4ADFA541 3DD895D7 A4D1C46D D3D6F4FB 4369E96A 346ED9FC AD678846 DA60B8D0 44042D73 33031DE5 AA0A4C5F DD0D7CC9 5005713C 270241AA BE0B1010 C90C2086 5768B525 206F85B3 B966D409 CE61E49F 5EDEF90E 29D9C998 B0D09822 C7D7A8B4 59B33D17 2EB40D81 B7BD5C3B C0BA6CAD EDB88320 9ABFB3B6 03B6E20C 74B1D29A EAD54739 9DD277AF 04DB2615 73DC1683 E3630B12 94643B84 0D6D6A3E 7A6A5AA8 E40ECF0B 9309FF9D 0A00AE27 7D079EB1 F00F9344 8708A3D2 1E01F268 6906C2FE F762575D 806567CB 196C3671 6E6B06E7 FED41B76 89D32BE0 10DA7A5A 67DD4ACC F9B9DF6F 8EBEEFF9 17B7BE43 60B08ED5 D6D6A3E8 A1D1937E 38D8C2C4 4FDFF252 D1BB67F1 A6BC5767 3FB506DD 48B2364B D80D2BDA AF0A1B4C 36034AF6 41047A60 DF60EFC3 A867DF55 316E8EEF 4669BE79 CB61B38C BC66831A 256FD2A0 5268E236 CC0C7795 BB0B4703 220216B9 5505262F C5BA3BBE B2BD0B28 2BB45A92 5CB36A04 C2D7FFA7 B5D0CF31 2CD99E8B 5BDEAE1D 9B64C2B0 EC63F226 756AA39C 026D930A 9C0906A9 EB0E363F 72076785 05005713 95BF4A82 E2B87A14 7BB12BAE 0CB61B38 92D28E9B E5D5BE0D 7CDCEFB7 0BDBDF21 86D3D2D4 F1D4E242 68DDB3F8 1FDA836E 81BE16CD F6B9265B 6FB077E1 18B74777 88085AE6 FF0F6A70 66063BCA 11010B5C 8F659EFF F862AE69 616BFFD3 166CCF45 A00AE278 D70DD2EE 4E048354 3903B3C2 A7672661 D06016F7 4969474D 3E6E77DB AED16A4A D9D65ADC 40DF0B66 37D83BF0 A9BCAE53 DEBB9EC5 47B2CF7F 30B5FFE9 BDBDF21C CABAC28A 53B39330 24B4A3A6 BAD03605 CDD70693 54DE5729 23D967BF B3667A2E C4614AB8 5D681B02 2A6F2B94 B40BBE37 C30C8EA1 5A05DF1B 2D02EF8D';
	crc = crc ^ (-1);
	for( var i = 0, iTop = str.length; i < iTop; i++ ) {
		y = ( crc ^ str.charCodeAt( i ) ) & 0xFF;
		x = '0x' + table.substr( y * 9, 8 );
		crc = ( crc >>> 8 ) ^ x;
	}
	crc = crc ^ (-1);
	return ( crc < 0) ? crc += 4294967296 : crc;
}

/**
 * Encodes an ISO-8859-1 string to UTF-8 (php.js)
 */
flexihash.prototype.__utf8 = function( argString ) {
	var string = ( argString + '' ); // .replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	var utftext = '', start, end, stringl = 0;
	start = end = 0;
	stringl = string.length;
	for( var n = 0; n < stringl; n++ ) {
		var c1 = string.charCodeAt( n );
		var enc = null;
		if( c1 < 128 ) {
			end++;
		}
		else if( c1 > 127 && c1 < 2048 ) {
			enc = String.fromCharCode( ( c1 >> 6 ) | 192 ) + String.fromCharCode( ( c1 & 63 ) | 128 );
		}
		else {
			enc = String.fromCharCode( ( c1 >> 12 ) | 224 ) + String.fromCharCode( ( ( c1 >> 6 ) & 63 ) | 128 ) + String.fromCharCode( ( c1 & 63 ) | 128 );
		}
		if( enc !== null ) {
			if( end > start ) {
				utftext += string.substring( start, end );
			}
			utftext += enc;
			start = end = n+1;
		}
	}
	if( end > start ) {
		utftext += string.substring( start, string.length );
	}
	return utftext;
}

// ----------------------------------------
// export the module

module.exports = flexihash;
