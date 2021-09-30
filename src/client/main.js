const urlString = window.location.href;
const urlInstance = new URL(urlString);

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

const ghCode = urlInstance.searchParams.get('code');
const defaultOrg = urlInstance.searchParams.get('org');
if (defaultOrg) {
  document.getElementById('org-input').value = defaultOrg;
  sessionStorage.setItem('org', defaultOrg);
}
const defaultUser = urlInstance.searchParams.get('user');
if (defaultUser) {
  document.getElementById('username-input').value = defaultUser;
  sessionStorage.setItem('username', defaultUser);
}

const repoChoice = document.getElementById('repo-choice');
const repoFileList = document.getElementById('repo-file-list');
const repoList = document.getElementById('repo-list');

const isLocal = ['127.0.0.1', 'localhost']
  .filter((origin) => window.location.origin.indexOf(origin) !== -1);

class LazyState {
  repoValue = '';

  usernameValue = '';

  organizationValue = '';

  lookupUrl = '';

  ownerValue = '';

  names = {};
}

const retrieveApiSpec = (event) => {
  if (event.target) {
    const repoValue = event.target.value;
    const names = LazyState.names;
    if (!repoValue) {
      return null;
    }

    repoFileList.innerHTML = '';
    ownerValue = names[repoValue].owner;
    names[repoValue].paths.forEach((filepath) => {
      console.log(1, filepath);
      const url = `https://api.github.com/repos/${ownerValue}/${repoValue}/contents/${filepath}`;
      console.log({ url });
      const anchorNode = document.createElement('a');
      const listItemNode = document.createElement('li');
      anchorNode.href = url;
      anchorNode.innerText = url;
      listItemNode.appendChild(anchorNode);
      repoFileList.appendChild(listItemNode);

      listItemNode.addEventListener('click', async (event) => {
        event.preventDefault();
        const accessToken = sessionStorage.getItem('access_token');

        const config = {
          'Accept': 'application/vnd.github.v3.raw',
        };
        if (accessToken) {
          config['Authorization'] = `token ${accessToken}`;
        }
        const response = await fetch(url, {
          headers: new Headers(config),
          'method': 'GET',
        });

        let content;

        const responseBody = await response.text();
        try {
          content = atob(responseBody);
        } catch {
          content = responseBody;
        }
        try {
          content = atob(JSON.parse(content).content);
        } catch {}

        repoChoice.value = '';

        const ui = SwaggerUIBundle({
          dom_id: '#swagger-ui',
          presets: [
            SwaggerUIBundle.presets.apis,
          ],
        });

        ui.specActions.updateSpec(JSON.stringify(jsyaml.load(content)));
      });
      console.log(url.includes(params.filename), url, params.filename);
      if (url.includes(params.filename)) {
        const event = new Event('click');
        listItemNode.dispatchEvent(event);
      }
    });
  }
};


const getSwaggerDocs = async (username, accessToken, userType) => {
  const owner = userType === 'user' ? `user:${username}` : `org:${username}`
  const url = `https://api.github.com/search/code?q=${owner}+filename:openapi.yaml+filename:swagger.yaml+filename:swagger.json+filename:openapi.json&per_page=100`;
  const config = {
    'accept': 'application/vnd.github.v3+json',
  };
  if (accessToken) {
    config['Authorization'] = `token ${accessToken}`;
  }
  const response = await fetch(url, {
    headers: new Headers(config),
    'method': 'GET',
  });

  const files = await response.json();

  const names = files.items
    .reduce((prev, { path, repository }) => {
      if (prev[repository.name]) {
        prev[repository.name].paths.push(path);
      } else {
        prev[repository.name] = {
          paths: [path],
          owner: repository.owner.login,
        };
      }
      return prev;
    }, {});

  LazyState.names = names;
  return names;
};

const requestRepos = async (username, accessToken, repositories, page = 1, perPage = 100) => {
  const url = `https://api.github.com/search/repositories?q=user:${username}&per_page=${perPage}&page=${page}`;

  const config = {
    'accept': 'application/vnd.github.v3+json',
  };
  if (accessToken) {
    config['Authorization'] = `token ${accessToken}`;
  }

  const response = await fetch(url, {
    headers: new Headers(config),
    'method': 'GET',
  });

  const repositoriesResponse = await response.json();
  console.log(repositoriesResponse);
  let requestReposResult;

  if (repositories) {
    requestReposResult = repositories;
    requestReposResult.items.push.apply(requestReposResult.items, repositoriesResponse.items)
    console.log(requestReposResult.items)
  } else {
    requestReposResult = repositoriesResponse;
  }

  const resultsIncomplete = requestReposResult.items.length < requestReposResult.total_count;
  const exceededRange = (page * perPage) > requestReposResult.total_count;
  if (resultsIncomplete && !exceededRange) {
    requestReposResult = await requestRepos(username, accessToken, requestReposResult, page + 1)
  }

  return requestReposResult;

}

repoChoice.setAttribute('disabled', null);
const getUserRepos = async (username, userType) => {
  repoList.innerHTML = '';
  repoChoice.setAttribute('disabled', null);
  document.getElementById('repo-choice').style.outline = '3px solid red';

  const accessToken = sessionStorage.getItem('access_token');

  LazyState.usernameValue = username;
  LazyState.ownerValue = username;

  const files = await getSwaggerDocs(username, accessToken, userType);
  console.log({files});
  const repositories = await requestRepos(username, accessToken);
  console.log({ repositories });

  const names = repositories.items
    .map(({ name, description }) => ({ name, description }))
    .filter(({ name }) => files[name]);

  names.forEach(({ name, description }) => {
    const node = document.createElement('option');
    node.innerText = `${name}: ${description}`;
    node.value = name;
    repoList.appendChild(node);
  });
  document.getElementById('repo-choice').style.outline = '3px solid limegreen';
  if (names.length) {
    repoChoice.removeAttribute('disabled');
  }

  return names;
};

async function retrieveInputOnClick(event, attr = 'data-submit-for', userType = 'user') {
  const submitFor = event.target.getAttribute(attr);
  const inputNode = document.getElementById(submitFor);
  if (inputNode) {
    return getUserRepos(inputNode.value, userType);
  }

  console.error(`No element found using ${attr} to retrieve id="${submitFor}"`);
  return null;
}

const retrieveCredentials = async (redirectUrl) => {
  const clientIdResponse = await fetch('http://127.0.0.1:5000/client-id', {
    'accept': 'application/json',
    'method': 'GET',
  });
  const { clientId } = await clientIdResponse.json();

  const loginLink = document.getElementById('login-link');
  loginLink.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&amp;scope=repo&redirect_uri=${redirectUrl}`;

  return clientId;
};

const submitCode = async (ghCode) => {
  console.log(ghCode);
  const clientIdResponse = await fetch('http://127.0.0.1:5000/auth-token', {
    headers: new Headers({
      'code': ghCode,
      'redirect': urlString,
      'accept': 'application/json',
    }),
    'method': 'GET',
  });
  const {
    access_token,
    token_type,
    scope,
  } = await clientIdResponse.json();
  console.log({
    access_token,
    token_type,
    scope,
  });

  sessionStorage.setItem('access_token', access_token);

  return access_token;
};

const directoryList = document.getElementById('directory-list');

const goNextLevel = (anchorNode, inputNode, submitFor) => {
  const listItem = document.createElement('li');
  listItem.appendChild(anchorNode);

  directoryList.appendChild(listItem);
  anchorNode.addEventListener('click', (event) => {
    event.preventDefault();
    inputNode.value = anchorNode.href;
    crawlDirectory(submitFor);
  });
}

const crawlDirectory = async (submitFor) => {
  const inputNode = document.getElementById(submitFor);
  if (inputNode) {
    const value = inputNode.value;
    const contents = await fetch(value, {
      headers: new Headers({
        'accept': 'application/json',
      }),
    });
    const htmlString = await contents.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const directoryLinks = [...doc.querySelectorAll('.display-name a')];
    if (directoryLinks.length === 0) {
      SwaggerUIBundle({
        url: inputNode.value,
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
        ],
      });
      return [];
    }

    directoryList.innerHTML = '';
    directoryLinks.forEach((anchorNode) => goNextLevel(anchorNode, inputNode, submitFor));

    return directoryLinks;
  }

  console.error(`No element found using ${attr} to retrieve id="${submitFor}"`);
  return [];
};

const clientId = retrieveCredentials(urlString);

if (ghCode) {
  window.history.replaceState({}, document.title, window.location.pathname);
  submitCode(ghCode);
}

const usernameButton = document.getElementById('username-button');
usernameButton.addEventListener('click', (e) => {
  retrieveInputOnClick(e, 'data-submit-for', 'user');
});

const orgButton = document.getElementById('org-button');
orgButton.addEventListener('click', (e) => {
  retrieveInputOnClick(e, 'data-submit-for', 'organization')
});

const repoSelect = document.getElementById('repo-choice');
repoSelect.addEventListener('change', retrieveApiSpec);

const directoryButton = document.getElementById('directory-button');
directoryButton.addEventListener('click', (event) => {
  const attr = 'data-submit-for';
  const submitFor = event.target.getAttribute(attr);
  crawlDirectory(submitFor);
});

if (params.username) {
  const input = document.getElementById(usernameButton.dataset.submitFor);
  input.setAttribute('value', params.username);
  const event = new Event('click');
  usernameButton.dispatchEvent(event);
}

if (params.username && params.repoName) {
  const checkRepoLoop = setInterval(function () {
    const options = [...repoList.getElementsByTagName('option')];

    if (options.length) {
      // options.forEach((option, index) => {
      //   if (params.repoName === option.value) {
      //     option.selected = true;
      //     // options.selectedIndex = index;
      //   }
      // });
      repoChoice.setAttribute('value', params.repoName);
      const event = new Event('change');
      repoSelect.dispatchEvent(event);

      clearInterval(checkRepoLoop);
    }
  }, 200);
}
