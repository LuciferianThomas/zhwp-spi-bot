const { mwn } = require( 'mwn' ),
      moment = require( 'moment' ),
      jquery = require( 'jquery' ),
      { JSDOM } = require( 'jsdom' ),
      fs = require( 'fs' )

const time = ( date = moment(), format = "YYYY-MM-DD HH:mm" ) => {
  return moment( date ).utcOffset( 8 ).format( format )
}

const capitalize = (s) => {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const win = new ( JSDOM )( '' ).window
const $ = jquery( win, true )

const log = ( message ) => {
  fs.appendFile( './logs/debug.log', `${ time() } | ${ message }\n`, ( e ) => {
    if ( e ) return;
  } )
}

module.exports = {
  time,
  capitalize,
  $,
  log
}