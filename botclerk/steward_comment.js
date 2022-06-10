const { mwn } = require( 'mwn' ),
      moment = require( 'moment' )

const { time, capitalize, $ } = require( '../fn' )

const metabot = new mwn( {
  apiUrl: 'https://meta.wikimedia.org/w/api.php',
  userAgent: 'LuciferianBotSPI/1.0 (https://zh.wikipedia.org/wiki/Wikipedia:SPI)',
  defaultParams: { assert: 'user' }
} )

async function getStewards( bot ) {
  console.log( "正在獲取監管員列表" )

  let res = await metabot.query( {
    list: "allusers",
    augroup: "steward",
    aulimit: 100
  } )

  let stewards = res.query.allusers.length ? res.query.allusers.map(x => x.name) : []
  console.log( stewards )
  return stewards
}

module.exports = async ( bot ) => {
  let stewards = await getStewards( bot )  
  
  let stream = new bot.stream( "recentchange", {
    onopen: () => { logger.success( "EventSource online." ) },
    onerror: ( err ) => { logger.error( "EventSource:", err ) }
  } );
  
  stream.addListener( ( data ) => {
    return (
      data.wiki === 'metawiki'
      && data.title === 'Steward requests/Checkuser'
      && stewards.includes( data.user )
    )
  }, async ( data ) => {
    let { compare } = await bot.request({
      action: "compare",
      format: "json",
      fromrev: data.revision.old,
      torev: data.revision.new
    })
    let $diff = $( '<table>' ).append( compare.body )
    let diffText = []
    $diff.find( '.diff-addedline' ).each( ( _i, ele ) => {
      diffText.push( $( ele ).text() )
    } )
    let lastSig = diffText.slice().reverse()
      .find( line => new RegExp( `user(?:[ _]talk)?:${ data.user }.*? \d{2}:\d{2}, \d{1,2} (?:january|february|march|april|may|june|july|august|september|october|november|december) \d{4} \(UTC\)`, 'i' ).test( line ) )

    let SRCUpage = new metabot.page( 'Steward requests/Checkuser' )
    const wikitext = await SRCUpage.text()
    const editedReport = wikitext.match( new RegExp( `=== ?(.*?) ?===(?:.|\n)+?${ lastSig }` ) )
    if ( !( /@zh\.wikipedia/.test( editedReport[1] ) ) )
      return;
    
    let SPIcase = editedReport[0].match( /\| *discussion *= *\[\[:?(?:w:)?zh:.*?((?:Wikipedia|維基百科|维基百科|Project):傀儡調查\/案件\/.*?)[#\|\]]/i )[1]
    let changeState
    
    if ( diffText.find( line => /^\| *status *= *(.*?)$/m.test( line ) ) )
      changeState = diffText.find( line => /^\| *status *= *(.*?)$/m.test( line ) ).match( /^\| *status *= *(.*?)$/m )[1]

    out = `* {{clerk note|機械助理留言}}：監管員{{unping|${ data.user }}}在[[:m:SRCU]]作出了'''[[:m:Special:Diff/${ data.revision.new }|回覆]]'''${ changeState ? `並將案件狀態設為${ changeState }` : "" }。`

    let SPIpage = new bot.page( SPIcase )
    let SPI_wt = await SPIpage.text()
    let endorsedCase = SPI_wt.match( /=== *\d{4}年\d{1,2}月\d{1,2}日 *===(?:.|\n)+?----<!--+ 所有留言請放在此行以上 -->/g ).find( _case => _case.match( /\{\{SPI[ _]case[ _]status ?\| ?endorsed? ?\}\}/i ) )
    let new_wt = endorsedCase.replace( /(----<!--+ 所有留言請放在此行以上 -->)/, `${out}\n$1` )
    SPI_wt = SPI_wt.replace( endorsedCase, new_wt )
    
    await spipage.edit( ( { content } ) => {
      return {
        text: SPI_wt,
        summary: `機械助理提示（測試中，未正式投入使用）`,
        bot: true
      }
    } )
    
    return;
    // logger.info( data )
  } )
  
  return;
}