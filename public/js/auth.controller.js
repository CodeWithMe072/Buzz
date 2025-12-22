let AUTH_API_URL = "https://www.backcrafter.shop/api/v1/user"
let API_KEY = "sk_oau_li7b337d6473d1349b0c6c6b88405659af593a59cf711a0226"



async function createUser(data) {
  let response = await fetch(`${AUTH_API_URL}/create`, {
    method: "POST",
    headers: {
      "Content-type": "application/json",
      "api-key": API_KEY
    },
    body: JSON.stringify({ ...data })
  })
  let Responsedata = await response.json()
  return {Data:Responsedata,code:response.status}

}


async function loginuser(data) {
  let response = await fetch(`${AUTH_API_URL}/login`, {
    method: "POST",
    headers: {
      "Content-type": "application/json",
      "api-key": API_KEY
    },
    body: JSON.stringify({ ...data })
  })
  let Responsedata = await response.json()
  return {Data:Responsedata,code:response.status}

}

async function alluser() {
   let response = await fetch(`${AUTH_API_URL}/allusers`, {
    method: "POST",
    headers: {
      "Content-type": "application/json",
      "api-key": API_KEY
    }
  })
  let Responsedata = await response.json()
  return {Data:Responsedata,code:response.status}
  
}