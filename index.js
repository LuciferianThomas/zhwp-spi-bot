const { mwn } = require( 'mwn' )

const bot = new mwn( {
  apiUrl: 'https://zh.wikipedia.org/w/api.php',

  username: process.env.USERNAME,
  password: process.env.BOTPASSWORD,

  userAgent: 'LuciferianBotSPI/1.0 (https://zh.wikipedia.org/wiki/Wikipedia:SPI)',

  defaultParams: { assert: 'user' }
} )

bot.login().then( async () => {
  console.log( "成功登入" )

  require( './case_list' )( bot )
  // require( './botclerk/steward_comment' )( bot )
} )