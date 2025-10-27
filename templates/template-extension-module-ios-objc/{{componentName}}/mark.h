
#define MODULE_HASH @"{{moduleHash}}"

#define MODULE_NAME_GEN(A, B) [NSString stringWithFormat:@"%@_%@", (A), (B)]

#define MODULE_NAME_DRFINE(M)                                               \
        + (NSString *)name {                                                    \
            return MODULE_NAME_GEN(M, MODULE_HASH);      \
        }   \

#define AUTO_REGISTER(name)
