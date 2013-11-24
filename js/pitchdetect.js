var audioContext = new AudioContext();
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var detectorElem, canvasElem, pitchElem, noteElem, detuneElem, detuneAmount;

window.onload = function() {

	/*
	var test = new Array;
	for(var i=1 ; i<10 ; i++){
		test = test.concat( splitToMeasures(4,4,i) );
        }
	alert(test);
	*/

	//-5,G1,-4,D#1
	//-4 ,-1 ,G1 ,-2 ,-0 ,-2 ,D#1 

	/* Two buttons to control the live audio input/output */	
	openInputBtn = document.getElementById( "openInput" );
	closeInputBtn = document.getElementById( "closeInput" );

	detectorElem = document.getElementById( "detector" );
	canvasElem = document.getElementById( "output" );
	pitchElem = document.getElementById( "pitch" );
	noteElem = document.getElementById( "note" );
	detuneElem = document.getElementById( "detune" );
	detuneAmount = document.getElementById( "detune_amt" );

	detectorElem.ondragenter = function () { 
		this.classList.add("droptarget"); 
		return false; 
	};

	detectorElem.ondragleave = function () { 
		this.classList.remove("droptarget"); 
		return false; 
	};

	detectorElem.ondrop = function (e) {
  		this.classList.remove("droptarget");
  		e.preventDefault();
		theBuffer = null;

	  	var reader = new FileReader();
	  	reader.onload = function (event) {
	  		audioContext.decodeAudioData( event.target.result, function(buffer) {
	    			theBuffer = buffer;
	  			}, function(){
					alert("error loading!");
				} 
			); 

	  	};

	  	reader.onerror = function (event) {
	  		alert("Error: " + reader.error );
		};

	  	reader.readAsArrayBuffer(e.dataTransfer.files[0]);
	  	
		return false;
	};



}


function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}


function error() {
    alert('Stream generation failed.');
}


function getUserMedia(dictionary, callback) {
    try {
        if (!navigator.getUserMedia)
        	navigator.getUserMedia = navigator.webkitGetUserMedia;
        navigator.getUserMedia(dictionary, callback, error);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }
}

//Record the pitch sampled
var samples = new Array
var intervalId;
function samplePitch(){

  console.log("sample:"+noteElem.innerText+"\n");

  if( typeof samplePitch.prePitch == "undefined" ){
    samplePitch.prePitch = 'x';
  }

  if(samplePitch.prePitch!=noteElem.innerText){
    
    if(typeof samplePitch.pitchCount == "undefined"){
      samplePitch.prePitch = noteElem.innerText;
      samplePitch.pitchCount = 1;
    }else{
      //var splitNotes = splitToPowerOf2(samplePitch.pitchCount).reverse();
      //var str = "";
      var splitNotes = splitToMeasures(TIMES,UNIT_NOTE,samplePitch.pitchCount);
      for(var i = 0 ; i<splitNotes.length ; i++){
        //str += samplePitch.prePitch+splitNotes[i]+" ";
        samples.push(samplePitch.prePitch+splitNotes[i]);
      }
      //console.log(str);
      //Update prePitch and pitchCount
      samplePitch.prePitch = noteElem.innerText;
      samplePitch.pitchCount = 1;
    }
  }else{
    samplePitch.pitchCount ++;
  }

}

//var BPM = 75;
//var MIN_DURATION = 32;
function gotStream(stream) {
    // Create an AudioNode from the stream.
    var mediaStreamSource = audioContext.createMediaStreamSource(stream);
    

    // Connect it to the destination.
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    convertToMono( mediaStreamSource ).connect( analyser );
    updatePitch();


    //Enable the close button and disable the open button
    closeInputBtn.disabled = false;
    openInputBtn.disabled = true;

    //Sample the pitch every 1/MIN_DURATION note
    intervalId = setInterval("samplePitch()",60*1000/BPM/(MIN_DURATION/4));
}


function openLiveInput() {
    getUserMedia({audio:true}, gotStream);
}



var rafID = null;
var tracks = null;
var buflen = 1024;
var buf = new Uint8Array( buflen );
var MINVAL = 134;  // 128 == zero.  MINVAL is the "minimum detected signal" level.

function findNextPositiveZeroCrossing( start ) {
	var i = Math.ceil( start );
	var last_zero = -1;
	// advance until we're zero or negative
	while (i<buflen && (buf[i] > 128 ) )
		i++;
	if (i>=buflen)
		return -1;

	// advance until we're above MINVAL, keeping track of last zero.
	while (i<buflen && ((t=buf[i]) < MINVAL )) {
		if (t >= 128) {
			if (last_zero == -1)
				last_zero = i;
		} else
			last_zero = -1;
		i++;
	}

	// we may have jumped over MINVAL in one sample.
	if (last_zero == -1)
		last_zero = i;

	if (i==buflen)	// We didn't find any more positive zero crossings
		return -1;

	// The first sample might be a zero.  If so, return it.
	if (last_zero == 0)
		return 0;

	// Otherwise, the zero might be between two values, so we need to scale it.

	var t = ( 128 - buf[last_zero-1] ) / (buf[last_zero] - buf[last_zero-1]);
	return last_zero+t;
}


var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];


function noteFromPitch( frequency ) {
	var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
	return Math.round( noteNum ) + 69;
}


function frequencyFromNoteNumber( note ) {
	return 440 * Math.pow(2,(note-69)/12);
}


function centsOffFromPitch( frequency, note ) {
	return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
}


function updatePitch( time ) {
	var cycles = new Array;
	analyser.getByteTimeDomainData( buf );

	var i=0;
	// find the first point
	var last_zero = findNextPositiveZeroCrossing( 0 );

	var n=0;
	// keep finding points, adding cycle lengths to array
	while ( last_zero != -1) {
		var next_zero = findNextPositiveZeroCrossing( last_zero + 1 );
		if (next_zero > -1)
			cycles.push( next_zero - last_zero );
		last_zero = next_zero;

		n++;
		if (n>1000)
			break;
	}

	// 1?: average the array
	var num_cycles = cycles.length;
	var sum = 0;
	var pitch = 0;

	for (var i=0; i<num_cycles; i++) {
		sum += cycles[i];
	}

	if (num_cycles) {
		sum /= num_cycles;
		pitch = audioContext.sampleRate/sum;
	}

// confidence = num_cycles / num_possible_cycles = num_cycles / (audioContext.sampleRate/)
	var confidence = (num_cycles ? ((num_cycles/(pitch * buflen / audioContext.sampleRate)) * 100) : 0);

/*
	console.log( 
		"Cycles: " + num_cycles + 
		" - average length: " + sum + 
		" - pitch: " + pitch + "Hz " +
		" - note: " + noteFromPitch( pitch ) +
		" - confidence: " + confidence + "% "
		);
*/
	// possible other approach to confidence: sort the array, take the median; go through the array and compute the average deviation

 	detectorElem.className = (confidence>50)?"confident":"vague";
	// TODO: Paint confidence meter on canvasElem here.

 	if (num_cycles == 0) {
	 	pitchElem.innerText = "--";
		noteElem.innerText = "-";
		detuneElem.className = "";
		detuneAmount.innerText = "--";
 	} else {
	 	pitchElem.innerText = Math.floor( pitch );
	 	var note =  noteFromPitch( pitch );
		noteElem.innerText = noteStrings[note%12];
		var detune = centsOffFromPitch( pitch, note );
		if (detune == 0 ) {
			detuneElem.className = "";
			detuneAmount.innerText = "--";
		} else {
			if (detune < 0)
				detuneElem.className = "flat";
			else
				detuneElem.className = "sharp";
			detuneAmount.innerText = Math.abs( detune );
		}
	}

	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
	rafID = window.requestAnimationFrame( updatePitch );
}


function closeLiveInput(){
	cancelAnimationFrame(rafID);
	clearInterval(intervalId);
	alert("Stop!");
	var str="";
	for(var i=0; i<samples.length ;i++){
		str += samples[i]+((i+1==samples.length)? "":" ,");
	}
	console.log(str);
}

function getSamples(){
  return samples;
}


function splitToPowerOf2(num){
  var powList = new Array();
  var i = 0, j = 0;
  do{
    if(num&0x01) powList[i++] = Math.pow(2,j);
    j++;
    num >>=1;
  }while(num);
  return powList;
}


function splitToMeasures(times,unit,num){
  var noteList = new Array();
  var barCount = (MIN_DURATION/unit)*times;
 
  if( typeof splitToMeasures.numCount == "undefined" ){
    //alert("first! barCount = " + barCount);
    if(num<barCount){
      splitToMeasures.numCount = num;
      noteList = splitToPowerOf2(num).reverse();
      return noteList;
    }else{ // num >= barCount
      splitToMeasures.numCount = 0;
    }
  }else{
    if( (num+splitToMeasures.numCount)<barCount ){
      splitToMeasures.numCount += num;
      noteList = splitToPowerOf2(num).reverse();
      return noteList;
    }else{ // (num+splitToMeasures.numCount)>=barCount
      
    }
  }

  //num >= barCount or (num+splitToMeasures.numCount)>=barCount
  noteList = splitToPowerOf2( barCount - splitToMeasures.numCount ).reverse();
  noteList.push(0);// bar notation
  splitToMeasures.numCount = splitToMeasures.numCount + num - barCount;
  while( splitToMeasures.numCount>= barCount ){
    noteList.push(barCount);
    noteList.push(0);// bar notation
    splitToMeasures.numCount = splitToMeasures.numCount - barCount;  
  }
  if( splitToMeasures.numCount>0 ){
    noteList = noteList.concat( splitToPowerOf2(splitToMeasures.numCount).reverse() );
  }

  return noteList;
}


