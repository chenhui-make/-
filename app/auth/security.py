"""密码与会话摘要。"""
import hashlib
import hmac
import secrets

def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return "$".join(("scrypt", "16384", "8", "1", salt, digest))


def verify_password(password, stored):
    try:
        algorithm, n, r, p, salt, expected = stored.split("$")
        if (algorithm, n, r, p) != ("scrypt", "16384", "8", "1"):
            return False
        actual = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
        ).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()

