const { mwn } = require( 'mwn' ),
      moment = require( 'moment' )

const CronJob = require('cron').CronJob;

const time = ( date = moment() ) => {
  return moment( date ).utcOffset( 8 ).format( "YYYY-MM-DD HH:mm" )
}

const capitalize = (s) => {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const bot = new mwn( {
  apiUrl: 'https://zh.wikipedia.org/w/api.php',

  username: process.env.USERNAME,
  password: process.env.BOTPASSWORD,

  userAgent: 'LuciferianBotSPI/1.0 (https://zh.wikipedia.org/wiki/Wikipedia:SPI)',

  defaultParams: {
    assert: 'user'
  }
} )

bot.login().then( async () => {
  console.log( "成功登入" )

  const TABLE_LOCATION = 'Wikipedia:傀儡調查/案件'

  async function getClerkList() {
    console.log( "正在獲取調查助理列表" )
    let clerks = []

    let SPIC = new bot.page( 'Wikipedia:傀儡調查/調查助理' )
    
    let lines = ( await SPIC.text() ).split( /\n/g )
    // console.log( lines ) 
    let aCS = lines.indexOf( lines.find( x => /活躍調查助理/.test( x ) ) )   // active clerk section index
      , iCS = lines.indexOf( lines.find( x => /不活躍調查助理/.test( x ) ) ) // inactive clerk section index

    let p = /\{\{\/ClerkUser\|([^}]+)}}/

    for ( i = aCS + 1; i < iCS; i++ ) {
      let line = lines[i]
      if ( p.test( line ) ) {
        clerks.push( line.match( p )[1] )
      }
    }
    console.log( clerks )
    return clerks
  }

  async function getCUList() {
    console.log( "正在獲取用戶查核員列表" )

    let res = await bot.query( {
      list: "allusers",
      augroup: "checkuser",
      aulimit: 50
    } )

    let checkusers = res.query.allusers.length ? res.query.allusers.map(x => x.name) : []
    console.log( checkusers )
    return checkusers
  }

  async function getStatusFromCat( categories ) {
    console.log( "正在獲取案件狀態" )
    const cat2status = {
      // 'SPI cases currently being checked': 'inprogress',
      '傀儡調查－等候進行查核': 'endorsed',
      '傀儡調查－社群共識轉交查核': 'condefer',
      '傀儡調查－重新提出查核': 'relist',
      '傀儡調查－等候查核檢查': 'CUrequest',
      '傀儡調查－請求管理員協助': 'admin',
      '傀儡調查－請求調查助理協助': 'clerk',
      '傀儡調查－完成用戶查核': 'checked',
      '傀儡調查－待處理': 'open',
      // 'SPI cases declined for checkuser by CU': 'cudeclined',
      '傀儡調查－調查助理拒絕查核請求': 'declined',
      '傀儡調查－需要更多資訊': 'moreinfo',
      // 'SPI cases on hold by checkuser': 'cuhold',
      '傀儡調查－調查助理擱置': 'hold',
      '傀儡調查－等候存檔': 'close',
    }

    let statuses = []
    for ( cat of categories ) {
      let title = cat.category

      if ( title in cat2status ) {
        statuses.push( cat2status[ title ] )
      }
    }

    let result = []
      , curequest_only = []
      , misc_only = []
    
    const priority = [ 'clerk', 'admin', 'checked', 'close' ]
        , curequest = { 'inprogress': 0, 'relist': 1, 'condefer': 1.5, 'endorsed': 2, 'CUrequest': 3 }
        , misc = {
          'open': 0, /* 'cudeclined': 1, */
          'declined': 2, 'moreinfo': 3, 
          /* 'cuhold': 4, */ 'hold': 5}
    
    for ( status of statuses ) {
      if ( priority.includes( status ) ) {
        result.push( status )
      }
      else if ( status in curequest ) {
        curequest_only.push( status )
      }
      else if ( status in misc ) {
        misc_only.push( status )
      }
    }
        
    if ( curequest_only.length ) {
      result.push( curequest_only.sort( ( a, b ) => {
        curequest[ a ] - curequest[ b ]
      } )[ 0 ] )
    }
    if ( misc_only.length && ( result.length == 0 || ( result.length == 1 && result[ 0 ] == 'close' ) ) ) {
      result.push( misc_only.sort( ( a, b ) => {
        misc[ a ] - misc[ b ]
      } )[ 0 ] )
    }
    return result
  }

  async function getCaseDetails( title, clerks ) {
    let page = new bot.page( `${ title }` )
    console.log( `正在獲取 ${ title } 的案件資訊` )
    let _case = {
      name: title.split(/\//g)[2],
      status: await getStatusFromCat( await page.categories() ),
      text: await page.text()
    }

    console.log( "　　正在找出最後留言之用戶" )
    let p = /\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)([^|\]]+)(?:.(?!\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)(?:[^|\]]+)))*? (\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d{2}):(\d{2}) \(UTC\)/i

    let signatures = ( _case.text.match( new RegExp( p.source, p.flags + "g" ) ) || [] ).map( sig => {
      // console.log( sig.match( p ) )
      let [ _, user, year, month, day, hour, min ] = sig.match( p )
      if ( month.length == 1 ) month = "0" + month
      if (   day.length == 1 )   day = "0" + day
      return {
        user: capitalize( user ),
        timestamp: new Date( `${ year }-${ month }-${ day }T${ hour }:${ min }:00+00:00` )
      }
    } )
    
    _case.last_comment = signatures.sort( ( a, b ) => {
      return b.timestamp - a.timestamp
    } )[0];

    _case.last_clerk = signatures.filter( sig => {
      return clerks.includes( sig.user )
    } ).sort( ( a, b ) => {
      return b.timestamp - a.timestamp
    } )[0];

    _case.file_time = signatures.sort( ( a, b ) => {
      return a.timestamp - b.timestamp
    } )[0].timestamp

    console.log( _case )
    return _case
  }

  function sortCases( cases ) {
    const rank = {
      'inprogress': 0, 'endorsed': 1, 'condefer': 1.5, 'relist': 2,
      'QUICK': 3, 'CUrequest': 4, 'admin': 5, 'clerk': 6, 'checked': 7,
      'open': 8, 'cudeclined': 9, 'declined': 10, 'moreinfo': 11,
      'cuhold': 12, 'hold': 13, 'close': 14
    }
    return cases.sort( ( a, b ) => {
      return rank[ a.status ] - rank[ b.status ]
    } )
  }

  async function getAllCases( clerks ) {
    let cat = await bot.getPagesInCategory( 'Category:傀儡調查－進行中' )
    console.log( cat )
    let cases = []
    for ( page of cat ) {
      let _case = await getCaseDetails( page, clerks )
      if ( _case.status.length > 1 ) {
        statuses = _case.status
        for ( status of statuses ) {
          let case_copy = structuredClone( _case )
          case_copy.status = status
          cases.push( case_copy )
        }
      }
      else {
        try {
          _case.status = _case.status[0]
          cases.push( _case )
        }
        catch ( error ) {
          console.error( error )
          console.log( "以下案件可能在獲取資訊時被存檔：" )
          console.log( _case )
        }
      }
    }
    // cases.push( ...get_cu_needed_templates() )
    return sortCases(cases)
  }

  function formatTableRow( _case ) {
    return `{{SPIstatusentry|${ _case.name
      }|${ _case.status
      }|${ _case.file_time ? time( _case.file_time ) : "未知"
      }|${ _case.last_comment ? _case.last_comment.user : ""
      }|${ _case.last_comment ? time( _case.last_comment.timestamp ) : ""
      }|${ _case.last_clerk ? _case.last_clerk.user : ""
      }|${ _case.last_clerk ? time( _case.last_clerk.timestamp ) : "" }}}`
  }
  
  function generateCaseTable( cases ) {
    let result = "{{SPIstatusheader}}\n"
    for ( _case of cases ) {
      result += formatTableRow( _case )
    }
    if ( cases.length == 0 ) {
      result += "| colspan=7 align=center style=\"font-size:150%;font-weight:bold\" | 暫無活躍傀儡調查案件"
    }
    result += "\n|}"
    return result
  }

  var job = new CronJob('0 * * * * *', async () => {
    let clerks = await getClerkList()
    let checkusers = await getCUList()
    clerks.push( ...checkusers )
    // console.log( clerks )
    let cases = await getAllCases( clerks )
    let list = new bot.page( TABLE_LOCATION )
    await list.edit( ( { content } ) => {
      return {
        text: generateCaseTable( cases ),
        summary: `更新SPI案件列表（${ cases.length }活躍提報）`,
        bot: true
      }
    } )
    console.log( `已完成更新SPI案件列表（${ cases.length }活躍提報）` )
    return;
  }, null, true);
  job.start();
} )