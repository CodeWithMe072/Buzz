let AUTH_API_URL = "/auth"



async function createUser(data) {
  let response = await fetch(`${AUTH_API_URL}/register`, {
    method: "POST",
    headers: {
      "Content-type": "application/json"
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
      "Content-type": "application/json"
    },
    body: JSON.stringify({ ...data })
  })
  let Responsedata = await response.json()
  return {Data:Responsedata,code:response.status}

}

async function alluser() {
   let response = await fetch(`${AUTH_API_URL}/users`, {
    method: "GET",
    headers: {
      "Content-type": "application/json"
     
    }
  })
  let Responsedata = await response.json()
  return {Data:Responsedata,code:response.status}
  
}